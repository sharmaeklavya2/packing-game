// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3
// Copyright (C) 2020-2021 Eklavya Sharma. Licensed under GNU GPLv3.
'use strict';

class InputError extends Error {
    constructor(message) {super(message);}
}

function throwInputError(msg) {
    throw new InputError(msg);
}

var levelGenerators = new Map();
var defaultItemColorTikz = '3399ff';
var gameLoadParams = null;

//==[ Parsing ]=================================================================

function dictAssertAccess(d, key, name) {
    if(d.hasOwnProperty(key)) {
        return d[key];
    }
    else {
        throw new InputError(name + ': missing ' + key);
    }
}

function readObjectPropsWithAssert(input, reqProps, optProps, modProps, objname) {
    let o = {};
    for(let prop of reqProps) {
        if(input.hasOwnProperty(prop)) {
            o[prop] = input[prop];
        }
        else {
            throw new InputError("property '" + prop + "' is missing for " + objname);
        }
    }
    for(let [prop, value] of Object.entries(optProps)) {
        if(input.hasOwnProperty(prop)) {
            o[prop] = input[prop];
        }
        else {
            o[prop] = value;
        }
    }
    for(let [prop, prop2] of Object.entries(modProps)) {
        if(input.hasOwnProperty(prop)) {
            o[prop2] = input[prop];
        }
        else {
            o[prop2] = null;
        }
    }
    return o;
}

function getDefaultProfit(xLen, yLen, defaultProfit) {
    if(defaultProfit === 'area') {
        return xLen * yLen;
    }
    else {
        return defaultProfit;
    }
}

function itemInfoFromObject(j, id, defaultProfit) {
    if(Array.isArray(j)) {
        if(j.length < 2) {
            throw new InputError('invalid input for item ' + id +
                ': array of length ' + j.length);
        }
        let [xLen, yLen, profit] = j;
        if(profit === undefined) {
            profit = getDefaultProfit(xLen, yLen, defaultProfit);
        }
        return new ItemInfo(id, xLen, yLen, profit, null);
    }
    else {
        let reqProps = ['xLen', 'yLen'];
        let optProps = {'color': null, 'profit': null};
        let o = readObjectPropsWithAssert(j, reqProps, optProps, {}, 'item ' + id);
        if(o.profit === null) {
            o.profit = getDefaultProfit(o.xLen, o.yLen, defaultProfit);
        }
        return new ItemInfo(id, o['xLen'], o['yLen'], o['profit'], o['color']);
    }
}

function processLevel(j) {
    let reqProps = ['binXLen', 'binYLen', 'items'];
    let optProps = {'gameType': 'bp', 'startPos': [], 'solutions': null, 'defaultProfit': 0};
    let modProps = {'lowerBound': 'origLB', 'upperBound': 'origUB'};
    let o = readObjectPropsWithAssert(j, reqProps, optProps, modProps, 'level');
    let items = [];
    if(o.gameType !== 'bp') {
        throw new InputError("the only supported gameType is bp");
    }
    let id = 0;
    let area = 0;
    for(let itemObj of o['items']) {
        let n = itemObj.n;
        if(n === undefined) {
            n = 1;
        }
        for(let i=0; i<n; ++i) {
            let item = itemInfoFromObject(itemObj, id++, o.defaultProfit);
            items.push(item);
            area += item.area();
        }
    }
    o.items = items;
    if(o.solutions === null) {
        const solution = j['solution'];
        if(solution !== null && solution !== undefined) {
            o.solutions = {'solution': solution};
        }
        else {
            o.solutions = {};
        }
    }
    o.solutions = new Map(Object.entries(o.solutions));
    if(o.startPos.length > items.length) {
        addMsg('warning', 'startPos has length ' + o.startPos.length
            + ', but there are only ' + items.length + ' items. Ignoring last '
            + (o.startPos.length - items.length) + ' entries in startPos.');
        o.startPos.length = items.length;
    }
    else {
        const nToIns = items.length - o.startPos.length;
        for(let i=0; i<nToIns; ++i) {
            o.startPos.push(null);
        }
    }

    const binArea = o.binXLen * o.binYLen;
    o.computedLB = Math.ceil(area / binArea);
    o.computedLBReason = 'area';
    o.computedUB = items.length;
    o.computedUBReason = 'n';
    const areaBound = Math.ceil(4 * area / binArea) + 1;
    if(areaBound < o.computedUB) {
        o.computedUB = areaBound;
        o.computedUBReason = 'nfdh-area';
    }
    for(const [solnName, soln] of o.solutions.entries()) {
        if(soln.length > items.length) {
            const solnName2 = (o.solutions.size > 1 ? solnName + ' ' : '');
            addMsg('warning', 'solution ' + solnName2 + 'has length ' + soln.length
                + ', but there are only ' + items.length + ' items. Ignoring last '
                + (soln.length - items.length) + ' entries in solution.');
            soln.length = items.length;
        }
        else {
            const nToIns = items.length - soln.length;
            for(let i=0; i<nToIns; ++i) {
                soln.push(null);
            }
        }
        const [nBins, nPacked] = countUsedBinsAndPackedItems(soln);
        const computedUB = nBins + o.items.length - nPacked;
        if(computedUB < o.computedUB) {
            o.computedUBReason = solnName;
            o.computedUB = computedUB;
        }
    }
    o.autoPack = new Map();
    return o;
}

//==[ Level Generators ]========================================================

function hueToColor(hue) {
    return 'hsl(' + hue + ',90%,60%)';
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

function nonNegFloatConverter(x) {
    const y = parseFloat(x);
    return [!isNaN(y) && y >= 0, y];
}
const nonNegFloatMessage = 'should be a non-negative real number.';

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

function validateAndConvert(q, paramMap) {
    let errors = [];
    for(let [paramName, param] of paramMap) {
        if(q[paramName] === undefined || q[paramName] === null) {
            q[paramName] = param.defaultValue;
        }
        else {
            let [convSucc, converted] = param.convert(q[paramName]);
            if(convSucc) {
                q[paramName] = converted;
            }
            else {
                errors.push(param.name + ' ' + param.validationMessage);
            }
        }
    }
    return errors;
}

function addRandomColors(items, rand) {
    for(let item of items) {
        item.color = hueToColor(Math.floor(rand() * 360));
    }
}

function levelGenBP1(q) {
    let n = q.n, binXLen = q.xLen, binYLen = q.yLen;
    let items = [];
    let obj = {
        "binXLen": binXLen, "binYLen": binYLen,
        "gameType": "bp", "items": items, "defaultProfit": "area",
    };
    let rand = getRandGen(q.seed);
    for(let i=0; i<n; ++i) {
        items.push({
            "xLen": 1 + Math.floor(Math.pow(rand(), 3) * binXLen),
            "yLen": 1 + Math.floor(Math.pow(rand(), 3) * binYLen),
        });
    }
    addRandomColors(items, rand);
    items.sort(RectComparator);
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

function distinctChoose(xMin, xMax, rand) {
    /* Randomly choose two numbers x and y such that xMin <= x < y <= xMax */
    let x = xMin + Math.floor(rand() * (xMax - xMin));
    let y = xMin + Math.floor(rand() * (xMax - xMin));
    if(y < x) {
        [x, y] = [y, x];
    }
    y += 1;
    return [x, y];
}

function levelGen4in1(q) {
    const n = q.n, binXLen = q.xLen, binYLen = q.yLen;
    if(2 * q.xMargin >= binXLen) {
        throw new InputError('2 * xMargin should be less than xLen.');
    }
    if(2 * q.yMargin >= binYLen) {
        throw new InputError('2 * yMargin should be less than yLen.');
    }
    let items = [], solution = [];
    let obj = {
        "binXLen": binXLen, "binYLen": binYLen, "gameType": "bp",
        "items": items, "solution": solution,
    };
    let rand = getRandGen(q.seed);
    for(let i=0; i<n; ++i) {
        let [x1, x2] = distinctChoose(q.xMargin, binXLen - q.xMargin, rand);
        let [y1, y2] = distinctChoose(q.yMargin, binYLen - q.yMargin, rand);
        let x3 = binXLen - x2, y3 = binYLen - y2;
        items.push({'xLen': x1, 'yLen': y2},
            {'xLen': x2, 'yLen': binYLen - y2},
            {'xLen': binXLen - x2, 'yLen': binYLen - y1},
            {'xLen': binXLen - x1, 'yLen': y1});
        solution.push([i, 0, 0], [i, 0, y2], [i, x2, y1], [i, x1, 0]);
        if(q.fillCenter) {
            items.push({'xLen': x2 - x1, 'yLen': y2 - y1});
            solution.push([i, x1, y1]);
        }
    }
    addRandomColors(items, rand);
    return obj;
}

levelGen4in1.paramMap = toParamMap([
    new Parameter('n', 2, 'number of bins', positiveIntConverter, positiveIntMessage),
    new Parameter('xLen', 8, 'xLen of bin', positiveIntConverter, positiveIntMessage),
    new Parameter('yLen', 8, 'yLen of bin', positiveIntConverter, positiveIntMessage),
    new Parameter('fillCenter', true, 'fill center?', boolConverter, boolMessage, boolOptions),
    new Parameter('xMargin', 1, 'minimum xLen of vertical items',
        positiveIntConverter, positiveIntMessage),
    new Parameter('yMargin', 1, 'minimum yLen of horizontal item',
        positiveIntConverter, positiveIntMessage),
    new Parameter('seed', null, 'seed for random number generator',
        urlEncodeIdemp, urlEncodeIdempMessage),
]);
levelGen4in1.info = 'Generate an instance where each bin contains 4 interlocked items.'
levelGenerators.set('4in1', levelGen4in1);

function weightedSample(scores, rand) {
    let scoreSum = 0;
    for(let i=0; i < scores.length; ++i) {
        scoreSum += scores[i];
    }
    let x = rand() * scoreSum;
    let i=0;
    for(; i < scores.length & x >= scores[i]; ++i) {
        x -= scores[i];
    }
    return i;
}

function chooseItem(items, rand) {
    let scores = [];
    for(let i=0; i < items.length; ++i) {
        const score = items[i].xLen * items[i].yLen - 1;
        scores.push(score);
    }
    return weightedSample(scores, rand);
}

function splitItem(item, rand) {
    let newItems = [];
    if(item.xLen === 1 && item.yLen === 1) {
        return newItems;
    }
    const horCut = weightedSample([item.xLen - 1, item.yLen - 1], rand);
    // const horCut = (item.xLen > item.yLen ? 0 : 1);
    if(horCut) {
        if(item.yLen > 1) {
            const yLen1 = 1 + Math.floor(rand() * (item.yLen - 1));
            const yLen2 = item.yLen - yLen1;
            item.yLen = yLen1;
            let newItem = {'xLen': item.xLen, 'yLen': yLen2,
                'nBin': item.nBin, 'x': item.x, 'y': item.y + yLen1};
            newItems.push(newItem);
        }
    }
    else {
        if(item.xLen > 1) {
            const xLen1 = 1 + Math.floor(rand() * (item.xLen - 1));
            const xLen2 = item.xLen - xLen1;
            item.xLen = xLen1;
            let newItem = {'xLen': xLen2, 'yLen': item.yLen,
                'nBin': item.nBin, 'x': item.x + xLen1, 'y': item.y};
            newItems.push(newItem);
        }
    }
    return newItems;
}

function removeSmallArea(items, delFrac) {
    items.sort((item1, item2) => item2.xLen * item2.yLen - item1.xLen * item1.yLen);
    let totalArea = 0;
    let areas = [];
    for(let item of items) {
        let area = item.xLen * item.yLen;
        totalArea += area;
        areas.push(area);
    }
    let areaToDelete = delFrac * totalArea;
    while(areas.length > 0 && areas[areas.length - 1] <= areaToDelete) {
        areaToDelete -= areas.pop();
    }
    items.length = areas.length;
}

function randomShrink(items, shrinkFrac, rand) {
    if(shrinkFrac > 1) {
        shrinkFrac = 1;
    }
    for(let item of items) {
        item.xLen = item.xLen - Math.floor(item.xLen * shrinkFrac * rand());
        item.yLen = item.yLen - Math.floor(item.yLen * shrinkFrac * rand());
    }
}

function levelGenGuill(q) {
    const binXLen = q.xLen, binYLen = q.yLen;
    let items = [], solution = [];
    let obj = {
        "binXLen": binXLen, "binYLen": binYLen, "gameType": "bp",
        "items": items, "solution": solution,
    };
    for(let i=0; i < q.nBins; ++i) {
        items.push({'xLen': binXLen, 'yLen': binYLen, 'x': 0, 'y': 0, 'nBin': i});
    }
    let rand = getRandGen(q.seed);
    for(let i=0; i < q.nCuts; ++i) {
        const j = chooseItem(items, rand);
        let newItems = splitItem(items[j], rand);
        for(let newItem of newItems) {
            items.push(newItem);
        }
    }
    removeSmallArea(items, q.delFrac);
    for(let i=0; i < items.length; ++i) {
        solution[i] = [items[i].nBin, items[i].x, items[i].y];
    }
    addRandomColors(items, rand);
    if(q.shrinkFrac > 0) {
        randomShrink(items, q.shrinkFrac, rand);
    }
    return obj;
}

levelGenGuill.paramMap = toParamMap([
    new Parameter('nBins', 3, 'number of bins', positiveIntConverter, positiveIntMessage),
    new Parameter('nCuts', 14, 'number of cuts', positiveIntConverter, positiveIntMessage),
    new Parameter('xLen', 12, 'xLen of bin', positiveIntConverter, positiveIntMessage),
    new Parameter('yLen', 12, 'yLen of bin', positiveIntConverter, positiveIntMessage),
    new Parameter('delFrac', 0.03, 'fraction of area to delete',
        nonNegFloatConverter, nonNegFloatMessage),
    new Parameter('shrinkFrac', 0.1, 'fraction to randomly shrink an item by',
        nonNegFloatConverter, nonNegFloatMessage),
    new Parameter('seed', null, 'seed for random number generator',
        urlEncodeIdemp, urlEncodeIdempMessage),
]);
levelGen4in1.info = 'Generate an instance by repeatedly cutting items.'
levelGenerators.set('guill', levelGenGuill);

//==[ Loading game ]============================================================

function applyToHttpResponse(url, hook, failHook) {
    let xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if(this.readyState === 4) {
            if(this.status >= 200 && this.status <= 299) {
                console.debug('received response for ' + url);
                hook(this.responseText);
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

function handleWithFailHook(e, failHook) {
    if(e instanceof InputError && failHook !== null) {
        failHook(e.message);
    }
    else {
        throw e;
    }
}

function loadGameFromRawLevel(level, scaleFactor=null, succHook=null, failHook=null) {
    let processedLevel = null;
    try {
        processedLevel = processLevel(level);
    }
    catch (e) {
        handleWithFailHook(e, failHook);
    }
    if(processedLevel !== null) {
        clearGame();
        gameLoadParams = null;
        game = new Game(processedLevel, scaleFactor);
        if(succHook !== null) {
            succHook();
        }
    }
}

function loadGameFromJsonString(levelString, scaleFactor=null, succHook=null, failHook=null) {
    let level = null;
    try {
        level = JSON.parse(levelString);
    }
    catch (e) {
        if(failHook !== null) {
            failHook('Invalid JSON: ' + e.message);
        }
        else {
            throw e;
        }
    }
    if(level !== null) {
        loadGameFromRawLevel(level, null, succHook, failHook);
    }
}

function loadGameFromUrl(url, scaleFactor=null, succHook=null, failHook=null) {
    let failHook2 = null;
    if(failHook !== null) {
        failHook2 = function(statusCode) {failHook("Network error: could not retrieve " + url
            + "; status code " + statusCode);};
    }
    applyToHttpResponse(url, function(text) {
            loadGameFromJsonString(text, scaleFactor, succHook, failHook);},
        failHook2);
}

function loadGameFromGen(genName, q, scaleFactor=null, succHook=null, failHook=null) {
    const gen = levelGenerators.get(genName);
    if(failHook === null) {
        failHook = throwInputError;
    }
    if(gen === undefined) {
        failHook('level generator ' + genName + ' not found');
    }
    else {
        let origQ = Object.assign({}, q);
        let errors = validateAndConvert(q, gen.paramMap);
        if(errors.length === 0) {
            let level = null;
            try {
                level = gen(q);
            }
            catch (e) {
                handleWithFailHook(e, failHook);
            }
            if(level !== null) {
                function succHook2() {
                    gameLoadParams = origQ;
                    gameLoadParams['srctype'] = 'gen';
                    gameLoadParams['src'] = genName;
                    if(scaleFactor !== null) {
                        gameLoadParams['scaleFactor'] = scaleFactor;
                    }
                    if(succHook !== null) {succHook();}
                }
                loadGameFromRawLevel(level, scaleFactor, succHook2, failHook);
            }
        }
        else {
            failHook(errors);
        }
    }
}

function loadGameFromFile(file, scaleFactor=null, succHook=null, failHook=null) {
    const reader = new FileReader();
    reader.addEventListener('load', function(ev) {
        loadGameFromJsonString(ev.target.result, scaleFactor, succHook, failHook);
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

function getQParams() {
    let params = new URLSearchParams(window.location.search);
    let d = {};
    for(let [key, value] of params.entries()) {
        if(value !== '') {
            d[key] = value;
        }
    }
    console.debug('query params:', JSON.stringify(d));
    return d;
}

function loadGameFromQParams(q, succHook=null, failHook=null) {
    if(Object.keys(q).length === 0) {
        q = {'srctype': 'gen', 'src': 'bp1'};
    }

    let scaleFactor = null;
    if(q.hasOwnProperty('scaleFactor')) {
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
    try {
        const srctype = dictAssertAccess(q, 'srctype', 'querystring');

        if(srctype === 'url') {
            const url = dictAssertAccess(q, 'src', 'querystring');
            loadGameFromUrl(url, scaleFactor, succHook, failHook);
        }
        else if(srctype === 'gen') {
            const genName = dictAssertAccess(q, 'src', 'querystring');
            loadGameFromGen(genName, q, scaleFactor, succHook, failHook);
        }
        else {
            throw new InputError('unknown srctype: ' + srctype);
        }
    }
    catch (e) {
        handleWithFailHook(e, failHook);
    }
}

//==[ Saving / Export ]=========================================================

function downloadBlob(blob, filename, cleanup=false) {
    let url = URL.createObjectURL(blob);
    let downloaderElem = document.getElementById('downloader');
    downloaderElem.href = url;
    downloaderElem.download = filename;
    downloaderElem.click();
    if(cleanup) {
        setTimeout(function() {
                downloaderElem.removeAttribute('href');
                downloaderElem.removeAttribute('download');
                window.URL.revokeObjectURL(url);
            }, 0);
    }
}

function serializeItemInfo(itemInfo) {
    let o = {"xLen": itemInfo.xLen, "yLen": itemInfo.yLen};
    if(itemInfo.color !== null) {
        o['color'] = itemInfo.color;
    }
    if(itemInfo.profit !== null && itemInfo.profit !== 0) {
        o['profit'] = itemInfo.profit;
    }
    return o;
}

function serItemsEqual(a, b) {
    return (a.xLen === b.xLen && a.yLen === b.yLen
        && a.profit === b.profit && a.color === b.color);
}

function prettyJSONizeHelper(o) {
    if(Array.isArray(o)) {
        let maxHeight = 0;
        let serials = [];
        for(const x of o) {
            const [jx, hx] = prettyJSONizeHelper(x);
            serials.push(jx);
            maxHeight = Math.max(maxHeight, hx);
        }
        const separator = (maxHeight >= 1 ? ',\n' : ', ');
        const delims = (maxHeight >= 1 ? ['[\n', '\n]'] : ['[', ']']);
        return [delims[0] + serials.join(separator) + delims[1], maxHeight + 1];
    }
    else if(o !== null && o !== undefined && o.constructor === Object) {
        let maxHeight = 0;
        let serials = [];
        for(const [k, v] of Object.entries(o)) {
            const [jv, hv] = prettyJSONizeHelper(v);
            serials.push(JSON.stringify(k) + ': ' + jv);
            maxHeight = Math.max(maxHeight, hv);
        }
        const separator = (maxHeight >= 1 ? ',\n' : ', ');
        const delims = (maxHeight >= 1 ? ['{\n', '\n}'] : ['{', '}']);
        return [delims[0] + serials.join(separator) + delims[1], maxHeight + 1];
    }
    else {
        return [JSON.stringify(o), 0];
    }
}

function prettyJSONize(o) {
    return prettyJSONizeHelper(o)[0];
}

function serializeLevel(level, pos=null) {
    let o = {"binXLen": level.binXLen, "binYLen": level.binYLen, "gameType": level.gameType};

    let serItems = [];
    o['items'] = serItems;
    let prevSerItem = null;
    for(let i=0; i < level.items.length; ++i) {
        let serItem = serializeItemInfo(level.items[i]);
        if(prevSerItem !== null && serItemsEqual(prevSerItem, serItem)) {
            let n = prevSerItem['n'];
            if(n === undefined) {
                prevSerItem['n'] = 2;
            }
            else {
                prevSerItem['n'] = n+1;
            }
        }
        else {
            serItems.push(serItem);
            prevSerItem = serItem;
        }
    }

    if(pos !== null && pos.length > 0) {o['startPos'] = pos;}
    if(level.origLB !== null) {o['lowerBound'] = level.origLB;}
    if(level.origUB !== null) {o['upperBound'] = level.origUB;}
    if(level.solutions.size > 0) {
        let [[k, v]] = level.solutions.entries();
        if(level.solutions.size === 1 && k === 'solution') {
            o["solution"] = v;
        }
        else {
            o["solutions"] = Object.fromEntries(level.solutions.entries());
        }
    }
    return o;
}

function downloadProgress(filename='progress.json', cleanup=false) {
    let level = serializeLevel(game.level, game.getItemPositions());
    let blob = new Blob([prettyJSONize(level)], {type: 'application/json'});
    downloadBlob(blob, filename, cleanup);
}

function getItemColor(itemId) {
    if(game === null) {
        return null;
    }
    else {
        let colorCode = window.getComputedStyle(game.items[itemId].domElem).backgroundColor;
        let [red, green, blue] = colorCode.match(/\d+/g).map(function(x) {return parseInt(x);});
        return ((1 << 24) + (red << 16) + (green << 8) + blue).toString(16).substr(1);
    }
}

var defaultTikzOptions = {
    'cellSize': '1cm',
    'margin': '0.1cm',
    'mirror': true,
    'wrap': true,
};

function getCellAndMarginSize() {
    let pxInCm = window.outerWidth / 21;
    let margin = (innerMargin / 2 / pxInCm) + 'cm';
    let cellSize = (game.scaleFactor / pxInCm) + 'cm';
    return [cellSize, margin];
}

function getPackedAndUnpackedItems(pos, nItems) {
    let packed = [], unpacked = [];
    for(let i=0; i < nItems; ++i) {
        if(pos[i] === undefined || pos[i] === null) {
            unpacked.push(i);
        }
        else {
            let [binId, xPos, yPos] = pos[i];
            if(packed[binId] === undefined) {
                packed[binId] = [];
            }
            packed[binId].push(i);
        }
    }
    for(let j=0; j < packed.length; ++j) {
        if(packed[j] === undefined) {
            packed[j] = [];
        }
    }
    return [unpacked, packed];
}

function binsToTikz(level, pos, options={}) {
    if(pos.length === 0) {
        console.warn('binsToTikz: no packed items.');
    }
    let [unpacked, packed] = getPackedAndUnpackedItems(pos, level.items.length);

    if(game !== null) {
        let [computedCellSize, computedMargin] = getCellAndMarginSize();
        if(options['cellSize'] === undefined) {
            options['cellSize'] = computedCellSize;
        }
        if(options['margin'] === undefined) {
            options['margin'] = computedMargin;
        }
    }
    for(let key in defaultTikzOptions) {
        if(defaultTikzOptions.hasOwnProperty(key)) {
            if(options[key] === undefined) {
                options[key] = defaultTikzOptions[key];
            }
        }
    }

    let lines = [
'\\ifcsname pGameL\\endcsname\\else\\newlength{\\pGameL}\\fi',
'\\ifcsname pGameM\\endcsname\\else\\newlength{\\pGameM}\\fi',
`\\setlength{\\pGameL}{${options['cellSize']}}`,
`\\setlength{\\pGameM}{${options['margin']}}`,
`\\definecolor{defaultItemColor}{HTML}{${defaultItemColorTikz}}`,
'\\tikzset{bin/.style={draw,thick}}',
'\\tikzset{binGrid/.style={draw,step=1\\pGameL,{black!20}}}',
'\\tikzset{item/.style={draw,fill=defaultItemColor}}',
];
    for(let j=0; j < packed.length; ++j) {
        lines.push('\\begin{tikzpicture}');
        lines.push('\\path (-\\pGameM, -\\pGameM) rectangle '
            + `(${level.binXLen}\\pGameL+\\pGameM, ${level.binYLen}\\pGameL+\\pGameM);`);
        lines.push('\\path[binGrid] (0\\pGameL, 0\\pGameL) grid '
            + `(${level.binXLen}\\pGameL, ${level.binYLen}\\pGameL);`);
        for(let i of packed[j]) {
            const xLen = level.items[i].xLen;
            const yLen = level.items[i].yLen;
            let [binId, xPos, yPos] = pos[i];
            if(options['mirror']) {
                yPos = level.binYLen - yPos - yLen;
            }
            let colorStyleStr = '';
            if(level.items[i].color !== null) {
                const color = getItemColor(i);
                if(color !== null) {
                    lines.push(`\\definecolor{currentItemColor}{HTML}{${color}}`);
                    colorStyleStr = ',fill=currentItemColor';
                }
            }
            lines.push(`\\path[item${colorStyleStr}] (${xPos}\\pGameL, ${yPos}\\pGameL) rectangle `
                + `+(${xLen}\\pGameL, ${yLen}\\pGameL);`);
        }
        lines.push('\\path[bin] (0\\pGameL, 0\\pGameL) rectangle '
            + `(${level.binXLen}\\pGameL, ${level.binYLen}\\pGameL);`);
        if(options['wrap']) {
            lines.push('\\end{tikzpicture}');
        }
        else {
            lines.push('\\end{tikzpicture}%');
        }
    }
    return lines.join('\n');
}

function downloadBinsToTikz(options={}, filename='bins.tikz', cleanup=false) {
    let tikz = binsToTikz(game.level, game.getItemPositions(), options);
    let blob = new Blob([tikz], {type: 'application/x-tex'});
    downloadBlob(blob, filename, cleanup);
}

const svgHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';
const svgNS = 'http://www.w3.org/2000/svg';

function createSvgElement(doc, parent, name, attrs={}) {
    let elem = doc.createElementNS(svgNS, name);
    for(let [key, value] of Object.entries(attrs)) {
        elem.setAttribute(key, value);
    }
    parent.appendChild(elem);
    return elem;
}

function levelToSvg(game, showInventory=null, textFunc=null) {
    if(game === null) {return null;}
    let level = game.level;
    let pos = game.getItemPositions();
    let inventoryPos = game.stripPackSol;
    const scaleFactor = game.scaleFactor, strokeWidth = 0.8 / scaleFactor;
    const invXLen = game.invXLen, invYLen = game.invYLen;

    let doc = document.implementation.createDocument(svgNS, 'svg');
    let root = doc.rootElement;
    let defs = createSvgElement(doc, root, 'defs');
    let pattern = createSvgElement(doc, defs, 'pattern', {
        'id': 'grid',
        'width': 1, 'height': 1,
        'patternUnits': 'userSpaceOnUse',
        });
    let gridRect = createSvgElement(doc, pattern, 'rect', {
        'width': 1, 'height': 1,
        'fill': 'none',
        'stroke': '#c8c8c8',
        'stroke-width': strokeWidth / 2,
        });
    let styleLines = [
        '.bin ~ .item {fill-opacity: 90%;}',
        '#inventory ~ .item {fill-opacity: 70%;}',
        '#inventory, .bin {fill: url(#grid);}',
        ];
    if(textFunc !== null) {
        styleLines.push(`g > text {transform: scale(${1/scaleFactor});}`);
    }
    let styleSheet = createSvgElement(doc, root, 'style');
    styleSheet.innerHTML = styleLines.join('\n');

    let [unpacked, packed] = getPackedAndUnpackedItems(pos, level.items.length);
    if(showInventory === null) {
        showInventory = (unpacked.length > 0);
    }

    function drawItem(i, xPos, yPos, parent) {
        const xLen = level.items[i].xLen, yLen = level.items[i].yLen;
        createSvgElement(doc, parent, 'rect', {
            'x': xPos, 'y': yPos,
            'width': xLen, 'height': yLen,
            'fill': level.items[i].color || defaultItemColor,
            'data-item-id': i, 'class': 'item',
            });
        if(textFunc !== null) {
            const text = textFunc(level.items[i]).toString();
            const fontSize = Math.min(16, 0.8 * scaleFactor * yLen,
                xLen * scaleFactor / text.length);
            let textNode = createSvgElement(doc, parent, 'text', {
                'x': (xPos + xLen / 2) * scaleFactor,
                'y': (yPos + yLen / 2) * scaleFactor + fontSize * 0.4,
                'text-anchor': 'middle',
                'font-size': fontSize,
                });
            textNode.innerHTML = text;
        }
    }

    if(showInventory) {
        let gInv = createSvgElement(doc, root, 'g', {
            'transform': `translate(${innerMargin}, ${innerMargin}) scale(${scaleFactor})`,
            'stroke': 'black', 'stroke-width': strokeWidth,
            });
        let rectInv = createSvgElement(doc, gInv, 'rect', {
            'width': invXLen, 'height': invYLen,
            'id': 'inventory',
            });
        for(let i of unpacked) {
            drawItem(i, inventoryPos[i][0], inventoryPos[i][1], gInv);
        }
    }

    const packXPos = (showInventory ? innerMargin * 2 + scaleFactor * invXLen : innerMargin);
    let packYPos = innerMargin;
    let maxBinXLen = 0;
    for(let j=0; j < packed.length; ++j) {
        const binXLen = game.bins[j].bin.xLen, binYLen = game.bins[j].bin.yLen;
        maxBinXLen = Math.max(maxBinXLen, binXLen);
        let gBin = createSvgElement(doc, root, 'g', {
            'transform': `translate(${packXPos}, ${packYPos}) scale(${scaleFactor})`,
            'stroke': 'black', 'stroke-width': strokeWidth,
            });
        let rectBin = createSvgElement(doc, gBin, 'rect', {
            'width': binXLen, 'height': binYLen,
            'data-bin-id': j, 'class': 'bin',
            });
        for(let i of packed[j]) {
            drawItem(i, pos[i][1], pos[i][2], gBin);
        }
        packYPos += innerMargin + scaleFactor * binYLen;
        maxBinXLen = Math.max(maxBinXLen, binXLen);
    }

    const totalWidth = packXPos + (packed.length > 0 ? maxBinXLen * scaleFactor + innerMargin : 0);
    const totalHeight = (showInventory?
        Math.max(packYPos, innerMargin * 2 + scaleFactor * invYLen) : packYPos);
    root.setAttribute('width', totalWidth);
    root.setAttribute('height', totalHeight);
    root.setAttribute('viewBox', '0 0 ' + totalWidth + ' ' + totalHeight);

    let serializer = new XMLSerializer();
    return svgHeader + (new XMLSerializer()).serializeToString(doc);
}

function downloadAsSvg(showInventory=null, textFunc=null, filename='packing-game.svg',
        cleanup=false) {
    let svgText = levelToSvg(game, showInventory, textFunc);
    let blob = new Blob([svgText], {type: 'image/svg+xml'});
    downloadBlob(blob, filename, cleanup);
}
// @license-end
