const ResxParser = require("resx-parser");
const fs = require("fs");
const readline = require("readline");
const XLSX = require("xlsx");
const parser = new ResxParser();

// Get params CLI
const [, , path] = process.argv;

const promisesFiles = [];
const resxToJSON = [];

if (path) {
    fs.readdir(`${path}`, (_, files) => {
        files.forEach(file => {
            promisesFiles.push(
                new Promise((resolveGroupBy, _) => {
                    const rd = readline.createInterface({
                        input: fs.createReadStream(`${path}/${file}`),
                        console: false
                    });

                    // Action line by line
                    let linesRESX = "";
                    rd.on("line", line => {
                        linesRESX += line;
                    });

                    // Close
                    rd.on("close", () => {
                        resolveGroupBy({ title: `${file}`, resx: linesRESX });
                    });
                })
            )
        })

        // Parse RESX
        Promise.all(promisesFiles).then(allFiles => {
            allFiles.forEach(fileInString => {
                resxToJSON.push(
                    new Promise((resolve, _) => {
                        parser.parseString(fileInString.resx, (err, result) => {
                            if (err) {
                                return console.log(err);
                            } else {
                                resolve({ title: `${fileInString.title}`, resx: result });
                            }
                        });
                    })
                );
            });

            Promise.all(resxToJSON).then(valueResx => {
                const individualName = getTypeFile(valueResx);
                const groupByTypes = groupFilesByCategory(individualName, valueResx);
                groupByTypes.forEach(group => {
                    const keys = [];
                    group.forEach(elementOfGroup => {
                        for (key in elementOfGroup.resx) {
                            if (!keys.find(x => x === key)) keys.push(key);
                        }
                    });

                    const datasToExtract = [];
                    const prefixs = getPrefixLanguage(group.map(x => x.title));
                    keys.forEach(key => {
                        values = {};
                        values["key"] = key;

                        prefixs.forEach((lang, index) => {
                            values[lang] = group[index].resx[key];
                        })
                        datasToExtract.push(values);
                    });

                    createExcel(getTitleFile(group[0].title), datasToExtract)
                })

            });
        })
    });
} else {
    console.log("\x1b[41m", "WARNING, YOU SHOULD PUT THE PATH OF YOUR RESOURCES WITH YOUR .RESX", "\x1b[0m")
}

/**
 * 
 * @param {String} _nameFile 
 * @param {Array} _datas 
 */
function createExcel(_nameFile, _datas) {
    console.log(_nameFile)
    const ws = XLSX.utils.json_to_sheet(_datas);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "translate");

    XLSX.writeFile(wb, `${path}/${_nameFile}.xlsx`);
}

/**
 * 
 * @param {Array - String} allResxFiles 
 */
function getPrefixLanguage(_allResxFiles) {
    const prefixLang = []
    _allResxFiles.forEach(file => {
        nameFilesSplitted = file.split(".");
        prefixLang.push(nameFilesSplitted[nameFilesSplitted.length - 2]);
    })

    return prefixLang;
}

/**
 * 
 * @param {Array - String} _files 
 */
function getTypeFile(_files) {
    const filesName = _files.map(x => x.title);
    const uniq = []
    filesName.map(file => {
        uniq.push(getTitleFile(file))
    })

    return uniq.filter((item, pos) => {
        return uniq.indexOf(item) == pos;
    })
}

/**
 * 
 * @param {String} _file 
 */
function getTitleFile(_file) {
    const splittedFile = _file.split(".");
    // Cut extensions file and Prefix language
    splittedFile.splice(-1, 1);
    splittedFile.splice(-1, 1);

    return splittedFile.join(".");
}

/**
 * 
 * @param {Array} _nameUniqFiles 
 * @param {Array} _files 
 */
function groupFilesByCategory(_nameUniqFiles, _files) {
    const filesGroupBy = [];
    _nameUniqFiles.forEach(f => {
        let groupBy = []
        _files.forEach(x => { if (x.title.startsWith(f)) groupBy.push(x) });
        filesGroupBy.push(groupBy);
    })

    return filesGroupBy;
}