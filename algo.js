'use strict';

//==[ Random-number generation ]================================================

// From https://stackoverflow.com/a/47593316/10294000

var seeds = [];

function xmur3(str) {
    for(var i = 0, h = 1779033703 ^ str.length; i < str.length; i++)
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353),
        h = h << 13 | h >>> 19;
    return function() {
        h = Math.imul(h ^ h >>> 16, 2246822507);
        h = Math.imul(h ^ h >>> 13, 3266489909);
        return (h ^= h >>> 16) >>> 0;
    }
}

function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

function getRandomSeed() {
    const seed = 'r' + Math.random().toString().substr(2, 12);
    seeds.push(seed);
    return seed;
}

function getRandGen(seed) {
    return mulberry32(xmur3(seed)());
}

//==[ Packing algorithms ]======================================================

var bpAlgos = {};

class Shelf {
    constructor(id, xLen) {
        this.id = id;
        this.free = xLen;
        this.items = [];
        this.size = 0;
    }

    add(item) {
        if(item.xLen <= this.free) {
            this.size = Math.max(this.size, item.yLen);
            this.free -= item.xLen;
            this.items.push(item);
            return true;
        }
        else {
            return false;
        }
    }
}

function nextFitShelfPack(items, xLen) {
    if(items.length == 0) {
        return [];
    }
    var shelfId = 0;
    var shelf = new Shelf(0, xLen);
    var shelves = [shelf];
    for(var i=0; i < items.length; ++i) {
        var item = items[i];
        if(!shelf.add(item)) {
            shelf = new Shelf(++shelfId, xLen);
            shelves.push(shelf);
            shelf.add(item);
        }
    }
    return shelves;
}

function firstFitShelfPack(items, xLen) {
    if(items.length == 0) {
        return [];
    }
    let shelves = [];
    for(var i=0; i < items.length; ++i) {
        let packed = false;
        const item = items[i];
        for(var j=0; j < shelves.length; ++j) {
            if(shelves[j].add(item)) {
                packed = true;
                break;
            }
        }
        if(!packed) {
            let shelf = new Shelf(shelves.length, xLen);
            shelves.push(shelf);
            shelf.add(item);
        }
    }
    return shelves;
}

function RectComparator(item1, item2) {
    if(item1.yLen < item2.yLen) {
        return 1;
    }
    else if(item1.yLen > item2.yLen) {
        return -1;
    }
    else if(item1.xLen < item2.xLen) {
        return 1;
    }
    else if(item1.xLen > item2.xLen) {
        return -1;
    }
    else {
        return 0;
    }
}

function nfdhShelfPack(items, xLen) {
    var sortedItems = [...items].sort(RectComparator);
    return nextFitShelfPack(sortedItems, xLen);
}

function ffdhShelfPack(items, xLen) {
    var sortedItems = [...items].sort(RectComparator);
    return firstFitShelfPack(sortedItems, xLen);
}

function packShelvesIntoStrip(shelves, stripXLen, output) {
    let yAgg=0;
    for(var i=0; i < shelves.length; ++i) {
        let items = shelves[i].items;
        let xAgg = 0;
        for(var j=0; j < items.length; ++j) {
            output[items[j].id] = [xAgg, yAgg];
            xAgg += items[j].xLen;
        }
        yAgg += shelves[i].size;
    }
    return output;
}

function nfdhStripPack(items, stripXLen, output) {
    var shelves = nfdhShelfPack(items, stripXLen);
    return packShelvesIntoStrip(shelves, stripXLen, output);
}

function ffdhStripPack(items, stripXLen, output) {
    var shelves = ffdhShelfPack(items, stripXLen);
    return packShelvesIntoStrip(shelves, stripXLen, output);
}

function nextFit1D(items, binSize, output) {
    var used = 0;
    var binId = 0;
    for(var i=0; i < items.length; ++i) {
        if(used + items[i].size <= binSize) {
            output[items[i].id] = [binId, used];
            used += items[i].size;
        }
        else {
            output[items[i].id] = [++binId, 0];
            used = items[i].size;
        }
    }
    return output;
}

function firstFit1D(items, binSize, output) {
    var usage = [];
    for(var i=0; i < items.length; ++i) {
        let itemSize = items[i].size;
        let packed = false;
        for(var j=0; j < usage.length; ++j) {
            if(usage[j] + itemSize <= binSize) {
                output[items[i].id] = [j, usage[j]];
                usage[j] += itemSize;
                packed = true;
                break;
            }
        }
        if(!packed) {
            output[items[i].id] = [usage.length, 0];
            usage.push(itemSize);
        }
    }
    return output;
}

function shelfBinPack(items, shelfAlgo, bpAlgo, binXLen, binYLen, output) {
    var shelves = shelfAlgo(items, binXLen);
    var shelfBPOutput = bpAlgo(shelves, binYLen, []);
    for(var i=0; i < shelves.length; ++i) {
        let items = shelves[i].items;
        let xAgg = 0;
        let [binId, y] = shelfBPOutput[i];
        for(var j=0; j < items.length; ++j) {
            output[items[j].id] = [binId, xAgg, y];
            xAgg += items[j].xLen;
        }
    }
    return output;
}

function nfdhBinPack(items, binXLen, binYLen, output) {
    return shelfBinPack(items, nfdhShelfPack, nextFit1D, binXLen, binYLen, output);
}
bpAlgos['nfdh'] = nfdhBinPack;
function ffdhNfBinPack(items, binXLen, binYLen, output) {
    return shelfBinPack(items, ffdhShelfPack, nextFit1D, binXLen, binYLen, output);
}
bpAlgos['ffdh-nf'] = ffdhNfBinPack;
function ffdhFfBinPack(items, binXLen, binYLen, output) {
    return shelfBinPack(items, ffdhShelfPack, firstFit1D, binXLen, binYLen, output);
}
bpAlgos['ffdh-ff'] = ffdhFfBinPack;

function getStripDims(items, stripPackSol) {
    var xLen = 0, yLen = 0;
    for(var i=0; i < items.length; ++i) {
        xLen = Math.max(xLen, stripPackSol[items[i].id][0] + items[i].xLen);
        yLen = Math.max(yLen, stripPackSol[items[i].id][1] + items[i].yLen);
    }
    return [xLen, yLen];
}

function countUsedBins(bpSol) {
    var ind = [];
    for(var i=0; i < bpSol.length; ++i) {
        ind[bpSol[i][0]] = 1;
    }
    var nBins = 0;
    for(var j=0; j < ind.length; ++j) {
        if(ind[j] !== undefined) {
            nBins++;
        }
    }
    return nBins;
}

function rotateAllItems(items) {
    for(var i=0; i < items.length; ++i) {
        let yLen = items[i].yLen;
        items[i].yLen = items[i].xLen;
        items[i].xLen = yLen;
    }
}

function mirrorAlgo(gbpAlgo) {
    function mirrorBinPack(items, binXLen, binYLen, output) {
        rotateAllItems(items);
        gbpAlgo(items, binYLen, binXLen, output);
        rotateAllItems(items);
        for(var i=0; i < output.length; ++i) {
            let y = output[i][2];
            output[i][2] = output[i][1];
            output[i][1] = y;
        }
        return output;
    }
    return mirrorBinPack;
}

function createMirrors() {
    let algoNames = [];
    for(let algoName of Object.keys(bpAlgos)) {
        if(bpAlgos.hasOwnProperty(algoName) && !algoName.endsWith('-mirror')) {
            algoNames.push(algoName);
        }
    }
    for(let algoName of algoNames) {
        bpAlgos[algoName + '-mirror'] = mirrorAlgo(bpAlgos[algoName]);
    }
}
createMirrors();


function dff1(x, xMax) {
    // identity function
    return x / xMax;
}

function dff2(x, xMax) {
    // step at 0.5
    const x2 = x * 2;
    if(x2 == xMax) {
        return 0.5;
    }
    else if(x2 < xMax) {
        return 0;
    }
    else {
        return 1;
    }
}

function dff3a(x, xMax) {
    // step at 1/3 and 2/3
    let x3 = x * 3;
    if(x3 <= xMax) {
        return 0;
    }
    else if(x3 < 2 * xMax) {
        return 0.5;
    }
    else {
        return 1;
    }
}

function dff3b(x, xMax) {
    // step at 1/3 and 2/3
    let xRel = x / xMax;
    let x3 = x * 3;
    if(x3 <= xMax) {
        return 0;
    }
    else if(x3 < 2 * xMax) {
        return 3 * xRel - 1;
    }
    else {
        return 1;
    }
}

function dffkGen(k) {
    function dffk(x, xMax) {
        // step at 1/k, 2/k, ..., (k-1)/k.
        const kx = k * x;
        for(let i=1; i < k; ++i) {
            if(kx <= i * xMax) {
                return (i-1) / (k-1);
            }
        }
        return 1;
    }
    return dffk;
}

var dffMap = new Map([
    ['id', dff1],
    ['f2', dff2],
    ['f3a', dff3a],
    ['f3b', dff3b],
    ['f4', dffkGen(4)],
    ['f5', dffkGen(5)],
]);

function getDffAgg(items, binXLen, binYLen, rotation) {
    let names = [];
    for(let name1 of dffMap.keys()) {
        if(rotation) {
            names.push('dffpair(' + name1 + ', ' + name1 + ')');
        }
        else {
            for(let name2 of dffMap.keys()) {
                names.push('dffpair(' + name1 + ', ' + name2 + ')');
            }
        }
    }

    let cumAreas = new Array(names.length).fill(0);
    for(let i=0; i < items.length; ++i) {
        let [xLen, yLen] = [items[i].xLen, items[i].yLen];
        let xs = [], ys = [];
        for(let f of dffMap.values()) {
            xs.push(f(xLen, binXLen));
            ys.push(f(yLen, binYLen));
        }
        let areas = [];
        if(rotation) {
            for(let j=0; j < xs.length; ++j) {
                areas.push(xs[j] * ys[j]);
            }
        }
        else {
            for(let x of xs) {
                for(let y of ys) {
                    areas.push(x * y);
                }
            }
        }
        console.assert(areas.length === cumAreas.length, 'areas.length != cumAreas.length');
        for(let j=0; j < cumAreas.length; ++j) {
            cumAreas[j] += areas[j];
        }
    }
    let pairs = [];
    for(let j=0; j < names.length; ++j) {
        pairs.push([names[j], cumAreas[j]]);
    }
    return new Map(pairs);
}

function bpLowerBound(items, binXLen, binYLen, rotation) {
    const delta = 0.00000001;

    let cumAreas = getDffAgg(items, binXLen, binYLen, rotation);
    let lb = 0;
    let reason = null;
    for(let [name, cumArea] of cumAreas.entries()) {
        let lbj = Math.ceil(cumArea - delta);
        if(lbj > lb) {
            lb = lbj;
            reason = name;
        }
    }
    return [lb, reason];
}
