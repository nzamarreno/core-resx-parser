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
const TRANSLATE = args.translate;
const REF = args.ref;

// API Key Microsoft Translator (Key is in Azure Portal)
const API_URL_TRANSLATOR = "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en";
const API_KEY_TRANSLATOR = "6c1550e2be0e423290dee12dfde8d2af";

if (!PATH) {
    console.log("\x1b[41m", "ERROR: THE PATH OF THE FOLDER CONTAINING THE .RESX FILES SHOULD BE PROVIDED", "\x1b[0m");
    return;
}

const valuesFormatted = [];
const allKeys = [];
// Pass ref if there is a ISO code, but here, the reference is "SharedResource" because there isn't code ISO after the name.
// Example if the reference file name is SharedResource.fr pass the ref param is "fr"
// Current example, here there is not code ISO, so, pass the file Name
const REFLANGUAGE = REF || "SharedResource";

fs.readdir(`${PATH}`, (_, files) => {

    const filesInFolder = files
        .filter(resxFile => resxFile.match(/resx$/) !== null)
        .map(resxFile => getPromiseWithParsedResx(resxFile));

    // { title: string; resx: {[key: string]: string}[] }[]
    Promise.all(filesInFolder).then(resxContentByFile => {
        const filesByName = getFilesByName(resxContentByFile);
        filesByName.forEach((fileGroup, index) => {
            fileGroup.forEach(resxFile => {
                for (key in resxFile.resx) {
                    if (!allKeys.find(x => x === key)) allKeys.push(key);
                }
            });

            const prefixLangages = getPrefixLanguages(fileGroup.map(x => x.title));

            const valuesByKey = [];

            allKeys.forEach(key => {
                values = {};
                values["key"] = key;

                prefixLangages.forEach((lang, index) => {
                    values[lang] = fileGroup[index].resx[key];
                })
                valuesByKey.push(values);
            });

            valuesFormatted.push({ name: fileGroup[0].title, values: valuesByKey });

            if (EXCEL) createExcel(title, valuesByKey);
            if (keysValueTwice.length > 0) createExcel("double-value", keysValueTwice);
        })

        if (TRANSLATE) {
            const keys = getMissingAndEmptyValueByLanguage(valuesFormatted);
            goTranslate(valuesFormatted, keys);
        }
    })
});

function getReferenceIndex(resources) {
    let index;
    for (let i = 0; i < resources.length; i++) {
        if (Object.keys(resources[i].values[0]).includes(REFLANGUAGE)) {
            index = i;
            break;
        }
    }

    return index;
}

function goTranslate(filesFormatted, keyMissing) {
    const indexRef = getReferenceIndex(filesFormatted);
    const ref = filesFormatted[indexRef];
    const keyTranslated = [];

    keyMissing.forEach(value => {
        const url = `${API_URL_TRANSLATOR}&to=${value.lang}`;
        const allKeysToTranslate = value.emptyKeys.concat(value.missingKeys);

        const toTranslate = ref.values.filter(r => allKeysToTranslate.includes(r.key));

        toTranslate.forEach(async (key, index) => {
            const result = await fetch(url, {
                method: 'post',
                body: JSON.stringify([{ Text: key[REFLANGUAGE] }]),
                headers: {
                    "Ocp-Apim-Subscription-Key": API_KEY_TRANSLATOR,
                    "Content-Type": "application/json"
                }
            });
            const responses = await result.json();

            responses.map(response => {
                if (INSERT) {
                    xmlpoke(`${PATH}/${value.name}`, function (xml) {
                        xml
                        .ensure(`root/data[@name='${key.key}']`)
                        .setOrAdd(`root/data[@name='${key.key}']/value`, response.translations[0].text);
                    });
                }
                keyTranslated.push({lang: value.lang, key: key.key, translate: response.translations[0].text, ref: key[REFLANGUAGE] });

                if ((toTranslate.length - 1) === index) createExcel(`${value.name}-translate`, keyTranslated);
            });
        });

    })
}

function getMissingAndEmptyValueByLanguage(filesFormatted) {
    const indexRef = getReferenceIndex(filesFormatted);
    const othersValues = filesFormatted.splice(0, indexRef);
    // {[key:string]: string; key: string}[]
    return othersValues.map(x => {
        const lang = Object.keys(x.values[1])[1];
        const emptyKeysEntities = x.values.filter(y => {
            if (y[lang] === "" || y[lang] === undefined) return y;
        });
        const emptyKeys = emptyKeysEntities.map(y => y.key);

        const missingKeysEntities = x.values.map(y => y.key);
        const missingKeys = allKeys.filter(y => !missingKeysEntities.includes(y));

        return {
            name: x.name,
            lang,
            emptyKeys,
            missingKeys
        }
    })
}

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
            keysTwice.push({ key: x, count: countValue });
        }
    });

    if (keysTwice.length > 0) {
        keysTwice.forEach(x => {
            keysValueTwice.push({ title: titleFile, value: x.key, count: x.count })
        });
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
        return fileNames.indexOf(item) === pos;
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