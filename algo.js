'use strict';

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

bpAlgos['nfdh2'] = mirrorAlgo(nfdhBinPack);

function bpLowerBound(items, binXLen, binYLen, rotation) {
    var area = 0;
    for(var i=1; i<items.length; ++i) {
        area += items[i].xLen * items[i].yLen;
    }
    var delta = 0.00000001;
    var rarea_lb = (area - delta) / (binXLen * binYLen);
    return Math.ceil(rarea_lb);
}
