'use strict';

class InputError extends Error {
    constructor(message) {super(message);}
}

var levelGenerators = new Map();

function hueToColor(hue) {
    return 'hsl(' + hue + ', 100%, 50%)';
}

class Parameter {
    constructor(name, defaultValue, description, convert, validationMessage, options=null) {
        this.name = name;
        this.defaultValue = defaultValue;
        this.description = description;
        this.convert = convert;
        this.validationMessage = validationMessage;
        this.options = options;
    }
}

function toParamMap(paramList) {
    let paramMap = new Map();
    for(let param of paramList) {
        paramMap.set(param.name, param);
    }
    return paramMap;
}

function positiveIntConverter(x) {
    const i = parseInt(x);
    return [!isNaN(i) && i > 0, i];
}
const positiveIntMessage = 'should be a positive integer.';

function boolConverter(x) {
    if(x === '1' || x === 'true') {
        return [true, true];
    }
    else if(x === '0' || x === 'false') {
        return [true, false];
    }
    else {
        return [false, null];
    }
}
const boolMessage = 'should be true or false.';
const boolOptions = ['true', 'false'];

function urlEncodeIdemp(x) {
    return [x.match(/^[0-9a-zA-Z_.~-]+$/), x];
}
const urlEncodeIdempMessage = 'should only contain letters, numbers, dot, hyphen, underscore, tilde.'

function levelGenBP1(q) {
    var n = q.n, binXLen = q.xLen, binYLen = q.yLen;
    var items = [];
    var obj = {
        "binXLen": binXLen, "binYLen": binYLen,
        "gameType": "bp", "items": items,
    };
    if(q.seed === null) {
        q.seed = getRandomSeed();
    }
    var rand = getRandGen(q.seed);
    for(var i=0; i<n; ++i) {
        items.push({
            "xLen": 1 + Math.floor(Math.pow(rand(), 3) * binXLen),
            "yLen": 1 + Math.floor(Math.pow(rand(), 3) * binYLen),
            "color": hueToColor(Math.floor(rand() * 360)),
        });
    }
    return obj;
}

levelGenBP1.paramMap = toParamMap([
    new Parameter('n', 25, 'number of items', positiveIntConverter, positiveIntMessage),
    new Parameter('xLen', 8, 'xLen of bin', positiveIntConverter, positiveIntMessage),
    new Parameter('yLen', 8, 'yLen of bin', positiveIntConverter, positiveIntMessage),
    new Parameter('seed', null, 'seed for random number generator',
        urlEncodeIdemp, urlEncodeIdempMessage),
]);
levelGenBP1.info = 'Independently and randomly generate colors and dimensions of each item.'
levelGenerators.set('bp1', levelGenBP1);

function applyToJsonResponse(url, hook, failHook) {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if(this.readyState == 4) {
            if(this.status >= 200 && this.status <= 299) {
                console.debug('received response for ' + url);
                var json = JSON.parse(this.responseText);
                hook(json);
            }
            else {
                console.error('status code for ' + url + ':', this.status);
                if(failHook !== null) {
                    failHook(this.status);
                }
            }
        }
    };
    xhttp.open('GET', url, true);
    xhttp.send();
}

function loadGameFromRawLevel(level, scaleFactor=null, succHook=null, failHook=null) {
    let processedLevel = processLevel(level);
    clearGame();
    game = new Game(processedLevel, scaleFactor);
    if(succHook !== null) {
        succHook();
    }
}

function loadGameFromUrl(url, scaleFactor=null, succHook=null, failHook=null) {
    var failHook2 = null;
    if(failHook !== null) {
        failHook2 = function(statusCode) {failHook("could not retrieve " + url
            + "; status code " + statusCode);};
    }
    applyToJsonResponse(url, function(json) {
            loadGameFromRawLevel(json, scaleFactor, succHook, failHook);},
        failHook2);
}

function validateAndConvert(q, paramMap, failHook=null) {
    for(let [paramName, param] of paramMap) {
        if(q[paramName] === undefined || q[paramName] === null || q[paramName] === '') {
            q[paramName] = param.defaultValue;
        }
        else {
            let [convSucc, converted] = param.convert(q[paramName]);
            if(convSucc) {
                q[paramName] = converted;
            }
            else {
                if(failHook !== null) {
                    failHook(param.name + ' ' + param.validationMessage);
                }
                return false;
            }
        }
    }
    return true;
}

function loadGameFromGen(genName, q, scaleFactor=null, succHook=null, failHook=null) {
    var gen = levelGenerators.get(genName);
    if(gen === undefined) {
        throw new Error('level generator ' + genName + ' not found');
    }
    else {
        if(validateAndConvert(q, gen.paramMap, failHook)) {
            var level = gen(q);
            loadGameFromRawLevel(level, scaleFactor, succHook, failHook);
        }
    }
}

function loadGameFromFile(file, scaleFactor=null, succHook=null, failHook=null) {
    const reader = new FileReader();
    reader.addEventListener('load', function(ev) {
        var level = JSON.parse(ev.target.result);
        loadGameFromRawLevel(level, scaleFactor, succHook, failHook);
    });
    if(failHook !== null) {
        reader.addEventListener('error', function(ev) {
            failHook('failed to read ' + file.name + '.')
        });
    }
    reader.readAsText(file);
}

function loadGameFromFiles(files, scaleFactor=null, succHook=null, failHook=null) {
    if(files.length > 0) {
        console.log('loading file ' + files[0].name);
        loadGameFromFile(files[0], scaleFactor, succHook, failHook);
    }
    else {
        console.log('no file given to loader');
        if(succHook !== null) {
            succHook();
        }
    }
}

function loadGameFromUpload(scaleFactor=null, succHook=null, failHook=null) {
    uploadInfo['scaleFactor'] = scaleFactor;
    uploadInfo['succHook'] = succHook;
    uploadInfo['failHook'] = failHook;
    document.getElementById('level-loader').click();
}

function loadGameFromQParams(q, succHook=null, failHook=null) {
    if(Object.keys(q).length == 0) {
        q['srctype'] = 'gen';
        q['src'] = 'bp1';
    }

    var scaleFactor = null;
    if(q.hasOwnProperty('scaleFactor') && q.scaleFactor !== null && q.scaleFactor !== '') {
        if(q.scaleFactor === 'x' || q.scaleFactor === 'y') {
            scaleFactor = q.scaleFactor;
        }
        else {
            scaleFactor = parseFloat(q.scaleFactor);
            if(isNaN(scaleFactor) || scaleFactor <= 0) {
                scaleFactor = null;
            }
        }
    }
    var srctype = dictAssertAccess(q, 'srctype', 'querystring');

    if(srctype == 'url') {
        var url = dictAssertAccess(q, 'src', 'querystring');
        loadGameFromUrl(url, scaleFactor, succHook, failHook);
    }
    else if(srctype == 'gen') {
        var genName = dictAssertAccess(q, 'src', 'querystring');
        loadGameFromGen(genName, q, scaleFactor, succHook, failHook);
    }
    else {
        throw new InputError('unknown srctype: ' + srctype);
    }
}

function getQParams() {
    var params = new URLSearchParams(window.location.search);
    var d = {};
    for(let [key, value] of params.entries()) {
        d[key] = value;
    }
    console.debug('query params:', JSON.stringify(d));
    return d;
}
