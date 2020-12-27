'use strict';

class InputError extends Error {
    constructor(message) {super(message);}
}

var levelGenerators = {};

function hueToColor(hue) {
    return 'hsl(' + hue + ', 100%, 50%)';
}

function levelGenBP1(q) {
    var n = parseInt(q.n), binXLen = parseInt(q.xLen), binYLen = parseInt(q.yLen);
    var items = [];
    var obj = {
        "binXLen": binXLen, "binYLen": binYLen,
        "rotation": (q.rotation === 'true' || q.rotation === true),
        "gameType": "bp", "items": items,
    };
    for(var i=0; i<n; ++i) {
        items.push({
            "xLen": 1 + Math.floor(Math.pow(Math.random(), 3) * binXLen),
            "yLen": 1 + Math.floor(Math.pow(Math.random(), 3) * binYLen),
            "color": hueToColor(Math.floor(Math.random() * 360)),
        });
    }
    return obj;
}
levelGenBP1.defaultValues = {'n': 25, 'xLen': 8, 'yLen': 8, 'rotation': false};
levelGenBP1.info = 'Independently and randomly generate colors and dimensions of each item. '
    + 'Parameters: n is the number of items, xLen is the bin width, yLen is the bin height.';
levelGenerators['bp1'] = levelGenBP1;

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
    clearGame();
    globalGame = new Game(processLevel(level), scaleFactor);
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

function loadGameFromGen(genName, q, scaleFactor=null, succHook=null, failHook=null) {
    var gen = levelGenerators[genName];
    if(gen === undefined) {
        throw new Error('level generator ' + genName + ' not found');
    }
    else {
        addDefault(q, gen.defaultValues);
        var level = gen(q);
        loadGameFromRawLevel(level, scaleFactor, succHook, failHook);
    }
}

function loadGameFromFile(file, scaleFactor=null, succHook=null, failHook=null) {
    const reader = new FileReader();
    reader.addEventListener('load', function(ev) {
        var level = JSON.parse(ev.target.result);
        loadGameFromRawLevel(level, scaleFactor, succHook, failHook);
    });
    reader.addEventListener('error', function(ev) {
        failHook('failed to read ' + file.name + '.')
    });
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
    levelLoaderElem.click();
}

function loadGameFromQParams(q, succHook=null, failHook=null) {
    if(Object.keys(q).length == 0) {
        q['srctype'] = 'gen';
        q['src'] = 'bp1';
    }

    var scaleFactor = null;
    if(q.hasOwnProperty('scaleFactor')) {
        scaleFactor = parseFloat(q.scaleFactor);
        // check if scaleFactor is a valid float
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
