'use strict';

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

function bpBounds(items, binXLen, binYLen, rotation) {
    var area = 0;
    for(var i=1; i<items.length; ++i) {
        area += items[i].xLen * items[i].yLen;
    }
    var delta = 0.00000001;
    var rarea_lb = (area - delta) / (binXLen * binYLen);
    var rarea_ub = (area + delta) / (binXLen * binYLen);
    return [Math.ceil(rarea_lb), Math.ceil(4 * rarea_ub) + 1];
}
