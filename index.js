const fs = require("fs");
const XLSX = require("xlsx");
const fetch = require("node-fetch");
const xmlpoke = require('xmlpoke');
const xml2js = require('xml2js');
const args = require('yargs').argv;
const parser = new xml2js.Parser();

// Get params CLI
const PATH = args.path;
const EXCEL = args.excel;
const INSERT = args.insert;

// API Key Microsoft Translator (Key is in Azure Portal)
const API_URL_TRANSLATOR = "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en";
const API_KEY_TRANSLATOR = "6c1550e2be0e423290dee12dfde8d2af";

if (!PATH) {
    console.log("\x1b[41m", "ERROR: THE PATH OF THE FOLDER CONTAINING THE .RESX FILES SHOULD BE PROVIDED", "\x1b[0m");
    return;
}

fs.readdir(`${PATH}`, (_, files) => {

    const filesInFolder = files
        .filter(resxFile => resxFile.match(/resx$/) !== null)
        .map(resxFile => getPromiseWithParsedResx(resxFile));

    Promise.all(filesInFolder).then(resxContentByFile => {
        const filesByName = getFilesByName(resxContentByFile);
        filesByName.forEach(fileGroup => {
            const allKeys = [];
            fileGroup.forEach(resxFile => {
                for (key in resxFile.resx) {
                    if (!allKeys.find(x => x === key)) allKeys.push(key);
                }
            });

            const valuesByKey = [];
            const prefixLangages = getPrefixLanguages(fileGroup.map(x => x.title));

            allKeys.forEach(key => {
                values = {};
                values["key"] = key;

                prefixLangages.forEach((lang, index) => {
                    values[lang] = fileGroup[index].resx[key];
                })
                valuesByKey.push(values);
            });
            translateValues(getFileTitle(fileGroup[0].title), valuesByKey);
            if (keysValueTwice.length > 0) createExcel("double-value", keysValueTwice);
        })
    })
});

function getPromiseWithParsedResx(resxFile) {
    return new Promise((resolve, _) => {
        fs.readFile(`${PATH}/${resxFile}`, function (err, fileContent) {
            parser.parseString(fileContent, function (err, parsedContent) {
                const resxObject = {};
                const allKeys = [];

                // RESX path <root> => <data>
                parsedContent.root.data.forEach(dataObject => {
                    if (dataObject.value === undefined) {
                        console.log("Missing value: ", dataObject["$"].name, resxFile);
                        return;
                    }
                    allKeys.push(`${dataObject["$"].name}`);
                    resxObject[`${dataObject["$"].name}`] = dataObject.value[0];
                });

                getDouble(allKeys, `${resxFile}`);

                resolve({ title: `${resxFile}`, resx: resxObject });
            });
        });
    })
}


/**
 * Get Values in double
 * @param {Array} keys 
 * @param {string} title 
 */
let keysValueTwice = [];
function valueIsAlreadyPresent(array, what) {
    return array.filter(item => item == what).length;
}

function getDouble(allKeys, titleFile) {
    // {key: string, count: number}
    const keysTwice = [];

    // Verify is value has is present twice
    allKeys.forEach(x => {
        let countValue = valueIsAlreadyPresent(allKeys, x);
        if (countValue > 1 && !keysTwice.some(value => value.key === x)) {
            keysTwice.push({key: x, count: countValue});
        }
    });

    if (keysTwice.length > 0) {
        keysTwice.forEach(x => {
            keysValueTwice.push({title: titleFile, value: x.key, count: x.count})
        });
    }
}

/**
 * Translate Values with Microsoft Translator API
 * @param {string} title 
 * @param {Array} valuesByKey 
 * @return {void}
 */
async function translateValues(title, valuesByKey) {
    const keysWithMissingTranslations = valuesByKey.filter(key => Object.keys(key).some(langage => key[langage] === undefined));

    keysWithMissingTranslations.map(async key => {
        const reference = key["en-GB"];
        if (reference) {
            const langagesToTranslate = Object.keys(key).filter(langage => key[langage] === undefined);

            // Call Microsoft Translator API
            const url = `${API_URL_TRANSLATOR}&to=${langagesToTranslate.join("&to=")}`;
            const result = await fetch(url, {
                method: 'post',
                body: JSON.stringify([{ Text: reference }]),
                headers: {
                    "Ocp-Apim-Subscription-Key": API_KEY_TRANSLATOR,
                    "Content-Type": "application/json"
                }
            });
            const response = await result.json();

            langagesToTranslate.map(langage => {
                const includeTo = response[0].translations.find(translation => langage.includes(translation.to));
                if (includeTo) key[langage] = includeTo.text;

                // Modify Resx and Insert value
                if (INSERT) {
                    xmlpoke(`${PATH}/${title}.${langage}.resx`, function (xml) {
                        xml
                            .ensure(`root/data[@name='${key.key}']`)
                            .setOrAdd(`root/data[@name='${key.key}']/value`, includeTo.text);
                    })
                }
            });
        }

        const valuesCompleted = [];
        valuesByKey.forEach(value => {
            const indexValue = valuesByKey.findIndex(x => x.key === value.key);
            if (indexValue) {
                valuesByKey[indexValue] = value;
            }
            valuesCompleted.push(value);
        })

        if (EXCEL) {
            createExcel(title, valuesCompleted);
        }
    })

    if (EXCEL) {
        createExcel(title, valuesByKey);
    }
}

/**
 * Create Excel File
 * @param {string} nameFile 
 * @param {Array} datas 
 * @return {void}
 */
function createExcel(nameFile, datas) {
    const ws = XLSX.utils.json_to_sheet(datas);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "translate");

    XLSX.writeFile(wb, `${PATH}/${nameFile}.xlsx`);
}

/**
 * Get code languages 
 * @param {string[]} allResxFiles
 * @return {string[]} 
 */
function getPrefixLanguages(allResxFiles) {
    return allResxFiles.map(file => {
        const nameFilesSplitted = file.split(".");
        return nameFilesSplitted[nameFilesSplitted.length - 2];
    });
}

/**
 * Get Array of file name 
 * present in the folder without suffix and extension
 * Example: your folder contain: translate.en-GB.resx / translate.fr-CA.resx / common.fr-CA.resx...
 * Return Array [translate, common]
 * @param {string[]} files
 * @return {string[]} 
 */
function getFilesName(files) {
    const fileNames = files.map(file => getFileTitle(file.title));

    return fileNames.filter((item, pos) => {
        return fileNames.indexOf(item) == pos;
    })
}

/**
 * Get only Title of file
 * Without suffix of language and file extension
 * @param {string} file 
 * @return {string}
 */
function getFileTitle(file) {
    return file.split(".").slice(0, 2).join(".");
}

/**
 * Get Array with title and key => value GroupBy by FileName
 * Example: your folder contain: translate.en-GB.resx / translate.fr-CA.resx / common.fr-CA.resx...
 * Return Array [[{title: translate.en-GB.resx, resx: Object}, {title: translate.fr-CA.resx, resx: Object}], 
 * [{title: common.fr-CA.resx, resx: Object}]]
 * @param {string[]} files 
 * @return {string[]}
 */
function getFilesByName(files) {
    const filesName = getFilesName(files);
    return filesName.map(uniqueName => files.filter(file => file.title.startsWith(uniqueName)))
}