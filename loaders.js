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

function loadGameFromRawLevel(level, scaleFactor=null) {
    clearGame();
    globalGame = new Game(processLevel(level), scaleFactor);
}

function loadGameFromUrl(url, scaleFactor=null) {
    applyToJsonResponse(url, function(json) {loadGameFromRawLevel(json, scaleFactor);}, null);
}

function loadGameFromGen(genName, q, scaleFactor=null) {
    var gen = levelGenerators[genName];
    if(gen === undefined) {
        throw new Error('level generator ' + genName + ' not found');
    }
    addDefault(q, gen.defaultValues);
    var level = gen(q);
    loadGameFromRawLevel(level, scaleFactor);
}

function loadGameFromFile(file, scaleFactor=null) {
    const reader = new FileReader();
    reader.addEventListener('load', function(ev) {
        var level = JSON.parse(ev.target.result);
        loadGameFromRawLevel(level, scaleFactor);
    });
    reader.readAsText(file);
}

function loadGameFromFiles(files, scaleFactor=null) {
    if(files.length > 0) {
        console.log('loading file ' + files[0].name);
        loadGameFromFile(files[0], scaleFactor);
    }
    else {
        console.log('no file given to loader');
    }
}

function loadGameFromUpload(scaleFactor=null) {
    uploadScaleFactor = scaleFactor;
    levelLoaderElem.click();
}

function loadGameFromQParams(q) {
    if(Object.keys(q).length == 0) {
        q['srctype'] = 'gen';
        q['src'] = 'bp1';
    }

    var scaleFactor = null;
    if(q.hasOwnProperty('scaleFactor')) {
        scaleFactor = parseFloat(q.scaleFactor);
    }
    var srctype = dictAssertAccess(q, 'srctype', 'querystring');

    if(srctype == 'url') {
        var url = dictAssertAccess(q, 'src', 'querystring');
        loadGameFromUrl(url, scaleFactor);
    }
    else if(srctype == 'gen') {
        var genName = dictAssertAccess(q, 'src', 'querystring');
        loadGameFromGen(genName, q, scaleFactor);
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
