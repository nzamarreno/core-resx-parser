# Core-RESX - Parser RESX - Excel
_Little utility for parse `.resx` files and create Excel for compare keys and verify if you don't forget translation._ 

## The must to have
- Node
- NPM or Yarn
- Microsoft Excel
- Terminal

## Installation
Before all, you should install NPM Package
```bash
$ npm install
```

## How is it work ?
Your command should be to launch in the folder root
```bash
$ node index.js ${path/of/my/resources}
```
> Now, you are happy, you have some files `.xsl` in the folder

## Tips
If you ask you, _what is the path of my resources ?_ go in your folder who contain your files and tape in your terminal
```bash
$ pwd
# /Users/John/myApp/Ressources
```

## Inscription Microsoft Translator
You should create your account for access to Azure Portal.  
You can follow these [instructions](https://docs.microsoft.com/en-us/azure/cognitive-services/translator/translator-text-how-to-signup).  
Over there, you get your key `RESOURCE MANAGEMENT > Keys`, after that, you can call API with your translate from => to and your text like this below: 
```javascript
CONST API_URL = "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=fr&to=da";

let result = await fetch(API_URL, {
    method: 'post',
    body: JSON.stringify([{Text: "Your text to translate"}]),
    headers: {
        "Ocp-Apim-Subscription-Key": {YOUR_KEY_AZURE_PORTAL}, 
        "Content-Type": "application/json"
    },
});
```
**Microsoft Documentation:** https://docs.microsoft.com/en-us/azure/cognitive-services/translator/reference/v3-0-translate?tabs=curl

---
**Made with love <3**

