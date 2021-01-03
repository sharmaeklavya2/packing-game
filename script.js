'use strict';

var arena = document.getElementById('arena');
var inventory = document.getElementById('inventory');
var hoverRect = document.getElementById('hover-rect');

var innerMargin = 10;  // margin between arena and the elements inside it, in px.
var outerMargin = 32;  // margin between arena and containing page.
var defaultItemColor = 'hsl(210, 100%, 60%)';
var defaultItemColorTikz = '3399ff';

var handleKeyPresses = true;
var game = null;
var globalDragData = null;
var uploadInfo = {'scaleFactor': null, 'succHook': null, 'failHook': null};

//==[ Logic Layer ]=============================================================

class Rectangle {
    constructor(xPos, yPos, xLen, yLen) {
        this.xPos = xPos;
        this.yPos = yPos;
        this.xLen = xLen;
        this.yLen = yLen;
    }
    equals(rect) {
        return (this.xPos == rect.xPos
            && this.yPos == rect.yPos
            && this.xLen == rect.xLen
            && this.yLen == rect.yLen);
    }
}

function array2d(m, n, x) {
/* create m-length list containing n-length lists of element x */
    var arr = [];
    for(var i=0; i<m; ++i) {
        let row = [];
        for(var j=0; j<n; ++j) {
            row.push(x);
        }
        arr.push(row);
    }
    return arr;
}

class DummyBin {
    constructor(xLen, yLen) {
        this.xLen = xLen;
        this.yLen = yLen;
        this.count = 0;
    }

    canFit(rect) {
        return (rect.xPos + rect.xLen <= this.xLen) && (rect.yPos + rect.yLen <= this.yLen);
    }

    isEmpty() {
        return this.count == 0;
    }

    insert(rect) {
        this.count += 1;
        return true;
    }

    remove(rect) {
        if(this.count == 0) {
            return false;
        }
        else {
            this.count -= 1;
            return true;
        }
    }
}

class Bin {
    constructor(xLen, yLen) {
        this.xLen = xLen;
        this.yLen = yLen;
        // this.rects = [];
        this._aggFilled = array2d(yLen+1, xLen+1, 0);
    }

    _getAggFilled(x, y) {
        console.assert(y <= this.yLen, 'y overflow: ', y);
        console.assert(x <= this.xLen, 'x overflow: ', x);
        return this._aggFilled[y][x];
    }
    _incAggFilled(x, y, z) {
        console.assert(y <= this.yLen, 'y overflow: ', y);
        console.assert(x <= this.xLen, 'x overflow: ', x);
        this._aggFilled[y][x] += z;
    }
    getFilledArea(rect) {
        var minX = Math.min(rect.xPos + rect.xLen, this.xLen);
        var minY = Math.min(rect.yPos + rect.yLen, this.yLen);
        return this._getAggFilled(minX, minY)
            - this._getAggFilled(rect.xPos, minY)
            - this._getAggFilled(minX, rect.yPos)
            + this._getAggFilled(rect.xPos, rect.yPos);
    }
    isEmpty() {
        return this._getAggFilled(this.xLen, this.yLen) == 0;
    }

    _fill(rect, z) {
        console.assert(rect.xPos + rect.xLen <= this.xLen, '_fill: x overflow');
        console.assert(rect.yPos + rect.yLen <= this.yLen, '_fill: y overflow');
        for(var i=1; i <= rect.yLen; ++i) {
            var y = rect.yPos + i;
            for(var j=1; j <= rect.xLen; ++j) {
                this._incAggFilled(rect.xPos + j, y, i * j * z);
            }
            for(var x = rect.xPos + rect.xLen + 1; x <= this.xLen; ++x) {
                this._incAggFilled(x, y, i * rect.xLen * z);
            }
        }
        for(var y = rect.yPos + rect.yLen + 1; y <= this.yLen; ++y) {
            for(var j=1; j <= rect.xLen; ++j) {
                this._incAggFilled(rect.xPos + j, y, rect.yLen * j * z);
            }
            let a = rect.yLen * rect.xLen;
            for(var x = rect.xPos + rect.xLen + 1; x <= this.xLen; ++x) {
                this._incAggFilled(x, y, a * z);
            }
        }
    }

    canFit(rect) {
        if((rect.xPos + rect.xLen > this.xLen) || (rect.yPos + rect.yLen > this.yLen)) {
            return false;
        }
        return this.getFilledArea(rect) == 0;
    }

    insert(rect) {
        if(this.canFit(rect)) {
            // this.rects.push(rect);
            this._fill(rect, 1);
            return true;
        }
    }

    remove(rect) {
        this._fill(rect, -1);
        return true;
    }
}

class ItemInfo {
    constructor(id, xLen, yLen, profit, color) {
        this.id = id;
        this.xLen = xLen;
        this.yLen = yLen;
        this.profit = profit;
        this.color = color;
    }
}

//==[ Util ]====================================================================

function arraysEqual(a, b) {
    if(a === b) {return true;}
    if(a === null || b === null) {return false;}
    if(a.length !== b.length) {return false;}
    for(var i = 0; i < a.length; ++i) {
        if(a[i] !== b[i]) {return false;}
    }
    return true;
}

function dictAssertAccess(d, key, name) {
    if(d.hasOwnProperty(key)) {
        return d[key];
    }
    else {
        throw new InputError(name + ': missing ' + key);
    }
}

function clip(x, lo, hi) {
    if (x <= lo) {
        return lo;
    }
    else if (x >= hi) {
        return hi;
    }
    else {
        return x;
    }
}

function readObjectPropsWithAssert(input, reqProps, optProps, objname) {
    var o = {};
    for(var prop of reqProps) {
        if(input.hasOwnProperty(prop)) {
            o[prop] = input[prop];
        }
        else {
            throw new InputError("property '" + prop + "' is missing for " + objname);
        }
    }
    if(optProps.constructor == Object) {
        for(let [prop, value] of Object.entries(optProps)) {
            if(input.hasOwnProperty(prop)) {
                o[prop] = input[prop];
            }
            else {
                o[prop] = value;
            }
        }
    }
    else {
        for(var prop of optProps) {
            if(input.hasOwnProperty(prop)) {
                o[prop] = input[prop];
            }
            else {
                o[prop] = null;
            }
        }
    }
    return o;
}

function toQueryString(obj) {
    var strs = [];
    for(let [key, value] of Object.entries(obj)) {
        strs.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
    }
    return strs.join("&");
}

function downloadBlob(blob, filename, cleanup=false) {
    var url = URL.createObjectURL(blob);
    var downloaderElem = document.getElementById('downloader');
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

//==[ SerDe and Cleaning ]======================================================

function itemInfoFromObject(j, id) {
    if(Array.isArray(j)) {
        if(j.length < 2) {
            throw new InputError('invalid input for item ' + id +
                ': array of length ' + j.length);
        }
        let [xLen, yLen, profit] = j;
        if(profit === undefined) {
            profit = 0;
        }
        return new ItemInfo(id, xLen, yLen, profit, null);
    }
    else {
        var reqProps = ['xLen', 'yLen'];
        var optProps = {'color': null, 'profit': 0};
        var o = readObjectPropsWithAssert(j, reqProps, optProps, 'item ' + id);
        return new ItemInfo(id, o['xLen'], o['yLen'], o['profit'], o['color']);
    }
}

function serializeItemInfo(itemInfo) {
    var o = {"xLen": itemInfo.xLen, "yLen": itemInfo.yLen};
    if(itemInfo.color !== null) {
        o['color'] = itemInfo.color;
    }
    if(itemInfo.profit !== null && itemInfo.profit !== 0) {
        o['profit'] = itemInfo.profit;
    }
    return o;
}

function processLevel(j) {
    var reqProps = ['binXLen', 'binYLen', 'items'];
    var optProps = {'gameType': 'bp', 'startPos': [],
        'lower_bound': null, 'upper_bound': null, 'solutions': {}};
    var o = readObjectPropsWithAssert(j, reqProps, optProps, 'level');
    var items = [];
    console.assert(o.gameType === 'bp', "the only supported gameType is bp");
    var id = 0;
    for(var itemObj of o['items']) {
        var n = itemObj.n;
        if(n === undefined) {
            n = 1;
        }
        for(var i=0; i<n; ++i) {
            var item = itemInfoFromObject(itemObj, id++);
            items.push(item);
        }
    }
    o.items = items;

    var ubAlgos = ['nfdh', 'nfdh-mirror', 'ffdh-ff', 'ffdh-ff-mirror'];
    o.computed_ub = items.length;
    o.computed_ub_reason = null;
    for(const algoName of ubAlgos) {
        if(o.solutions[algoName] === undefined || o.solutions[algoName] === null) {
            o.solutions[algoName] = bpAlgos[algoName](items, o.binXLen, o.binYLen, []);
        }
        const nBins = countUsedBins(o.solutions[algoName]);
        if(nBins < o.computed_ub) {
            o.computed_ub_reason = algoName;
            o.computed_ub = nBins;
        }
    }
    if(o.upper_bound === null) {
        o.upper_bound = o.computed_ub;
    }
    if(o.lower_bound === null) {
        [o.computed_lb, o.computed_lb_reason] = bpLowerBound(items, o.binXLen, o.binYLen, false);
        o.lower_bound = o.computed_lb;
    }
    return o;
}

function serItemsEqual(a, b) {
    return (a.xPos === b.xPos && a.yPos === b.yPos
        && a.profit === b.profit && a.color === b.color);
}

function serializeLevel(level, pos=null) {
    var o = {"binXLen": level.binXLen, "binYLen": level.binYLen,
        "gameType": level.gameType, "solutions": level.solutions,
        "lower_bound": level.lower_bound, "upper_bound": level.upper_bound};
    if(pos !== null && pos.length > 0) {o['startPos'] = pos;}

    var serItems = [];
    o['items'] = serItems;
    var prevSerItem = null;
    for(var i=0; i < level.items.length; ++i) {
        var serItem = serializeItemInfo(level.items[i]);
        if(prevSerItem !== null && serItemsEqual(prevSerItem, serItem)) {
            var n = prevSerItem['n'];
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
    return o;
}

//==[ UI Layer ]================================================================

function setPos(domElem, xPos, yPos) {
    domElem.style.top = yPos + 'px';
    domElem.style.left = xPos + 'px';
}

class ItemUI {
    constructor(itemInfo, scaleFactor) {
        this.itemInfo = itemInfo;
        this.xPos = null;
        this.yPos = null;
        this.binUI = null;

        // DOM
        this.domElem = document.createElement('div');
        this.domElem.classList.add('item');
        this.domElem.setAttribute('data-item-id', this.itemInfo.id);
        if(itemInfo.color !== null) {
            this.domElem.style.backgroundColor = itemInfo.color;
        }
        else {
            this.domElem.style.backgroundColor = defaultItemColor;
        }
        this.resize(scaleFactor);
    }

    resize(scaleFactor) {
        this.scaleFactor = scaleFactor;
        this.domElem.style.width = scaleFactor * this.itemInfo.xLen + 'px';
        this.domElem.style.height = scaleFactor * this.itemInfo.yLen + 'px';
        if(this.binUI !== null) {
            setPos(this.domElem, scaleFactor * this.xPos, scaleFactor * this.yPos);
        }
    }

    coords() {
        if(this.binUI !== null) {
           return [this.binUI.id, this.xPos, this.yPos];
        }
        else {
            return null;
        }
    }

    detach() {
        if(this.binUI !== null) {
            this.binUI.bin.remove(new Rectangle(this.xPos, this.yPos,
                this.itemInfo.xLen, this.itemInfo.yLen));
            this.binUI.domElem.removeChild(this.domElem);
            this.domElem.classList.remove('packed');
            game.stats.reportDetach(this.itemInfo, this.binUI.bin.isEmpty());
            this.binUI = null;
            inventory.appendChild(this.domElem);
            game._assessBins();
        }
    }

    attach(binUI, xPos, yPos) {
        console.assert(this.binUI === null, 'item infidelity');
        var wasEmpty = binUI.bin.isEmpty();
        if(binUI.bin.insert(new Rectangle(xPos, yPos, this.itemInfo.xLen, this.itemInfo.yLen))) {
            this.binUI = binUI;
            this.xPos = xPos;
            this.yPos = yPos;
            this.domElem.classList.add('packed');
            setPos(this.domElem, this.scaleFactor * xPos, this.scaleFactor * yPos);
            game.stats.reportAttach(this.itemInfo, wasEmpty);
            this.binUI.domElem.appendChild(this.domElem);
            game._assessBins();
            return true;
        }
        else {
            return false;
        }
    }
}

class BinUI {
    constructor(xLen, yLen, dummy, id, scaleFactor) {
        if(dummy) {
            this.bin = new DummyBin(xLen, yLen);
        }
        else {
            this.bin = new Bin(xLen, yLen);
        }
        this.id = id;

        this.domElem = document.createElement('div');
        this.domElem.classList.add('bin');
        this.domElem.setAttribute('data-bin-id', this.id);
        this.resize(scaleFactor);
    }

    resize(scaleFactor) {
        // this.scaleFactor = scaleFactor;
        this.domElem.style.width = this.bin.xLen * scaleFactor + 'px';
        this.domElem.style.height = this.bin.yLen * scaleFactor + 'px';
        this.domElem.style.backgroundSize = scaleFactor + 'px ' + scaleFactor + 'px';
    }

    destroy() {
        if(this.bin.isEmpty()) {
            let packingArea = document.getElementById('packing-area');
            packingArea.removeChild(this.domElem);
            this.bin = null;
            this.domElem = null;
        }
        else {
            throw new Error('attempt to destroy non-empty bin');
        }
    }
}

function createBarItems(domParent, names) {
    var domElems = {};
    for(var name of names) {
        var entryDom = document.createElement('div');
        entryDom.classList.add('bar-entry');
        var labelDom = document.createElement('div');
        labelDom.classList.add('bar-label');
        labelDom.innerHTML = name;
        var valueDom = document.createElement('div');
        valueDom.classList.add('bar-value');
        domElems[name] = valueDom;
        entryDom.appendChild(labelDom);
        entryDom.appendChild(valueDom);
        domParent.appendChild(entryDom);
    };
    return domElems;
}

class Stats {
    constructor(gameType, items, lb, ub) {
        // items are ItemInfo objects
        this.gameType = gameType;
        this.nItems = 0;
        this.nItemsPacked = 0;
        this.nBins = 0;
        this.profit = 0;
        this.lb = lb;
        this.ub = ub;
        for(var item of items) {
            this.nItems++;
            this.profit += item.profit;
        }

        var domElemNames = ['packed', 'unpacked'];
        if(this.gameType == 'bp') {
            domElemNames.push('bins used');
        }
        else if(this.gameType == 'ks') {
            domElemNames.push('profit');
        }
        var statsBar = document.getElementById('stats-bar');
        this.domElems = createBarItems(statsBar, domElemNames);
        this.refreshDom();
    }

    reportAttach(item, wasEmpty) {
        this.nItemsPacked++;
        this.profit += item.profit;
        if(wasEmpty) {
            this.nBins++;
        }
        this.refreshDom();
    }

    reportDetach(item, isEmpty) {
        this.nItemsPacked--;
        this.profit -= item.profit;
        if(isEmpty) {
            this.nBins--;
        }
        this.refreshDom();
    }

    refreshDom() {
        var d = {
            'packed': this.nItemsPacked,
            'unpacked': this.nItems - this.nItemsPacked,
            'bins used': this.nBins,
            'profit': this.profit,
        };
        for(let [key, value] of Object.entries(d)) {
            var domElem = this.domElems[key];
            if(domElem !== undefined) {
                domElem.innerHTML = value;
            }
        }
        if(d['unpacked'] === 0) {
            this.domElems['packed'].classList.add('success');
            this.domElems['unpacked'].classList.add('success');
        }
        else {
            this.domElems['packed'].classList.remove('success');
            this.domElems['unpacked'].classList.remove('success');
        }
        var binsUsedDomElem = this.domElems['bins used'];
        binsUsedDomElem.classList.remove('success');
        binsUsedDomElem.classList.remove('error');
        binsUsedDomElem.classList.remove('warning');
        if(this.nBins > this.ub) {
            binsUsedDomElem.classList.add('error');
        }
        else if(this.nBins > this.lb) {
            binsUsedDomElem.classList.add('warning');
        }
        else {
            binsUsedDomElem.classList.add('success');
        }
    }

    destroy() {
        var statsBar = document.getElementById('stats-bar');
        statsBar.innerHTML = '';
        this.domElems = null;
    }
}

function inferScaleFactors(invXLen, invYLen, binXLen, binYLen, nBins=1) {
    nBins = Math.max(1, nBins);
    const arenaX = window.innerWidth - 2 * outerMargin;
    const persistentFooterHeight = 32;
    const arenaY = window.innerHeight - 2 * outerMargin - persistentFooterHeight
        - getPersistentHeaderHeight();
    const scaleX = (arenaX - 4 * innerMargin) / (invXLen + binXLen);
    const scaleY1 = (arenaY - 2 * innerMargin) / invYLen;
    const scaleY2 = (arenaY - innerMargin * (nBins + 1)) / (nBins * binYLen);
    console.debug("inferred scales:", scaleX, scaleY1, scaleY2);
    return [scaleX, Math.min(scaleY1, scaleY2)];
}

class Game {

    constructor(level, scaleFactor=null) {
        game = this;
        this.level = level;
        this._computeInventoryDimsAndItemHomePositions();
        this.stats = new Stats(this.level.gameType, this.level.items,
            this.level.lower_bound, this.level.upper_bound);
        this.itemInfoBar = new ItemInfoBar(this.level.gameType);
        this.history = [];
        this.bins = [];
        this.items = [];

        this._setScaleFactor(scaleFactor);
        this._createItems();
        this._createBinsAndPackItems(this.level.startPos);
        repopulateSolveMenu();
    }

    getItemPositions() {
        var pos = [];
        var consecNulls = 0;
        for(var i=0; i < this.items.length; ++i) {
            var coords = this.items[i].coords();
            pos.push(coords);
            if(coords === null) {
                consecNulls += 1;
            }
            else {
                consecNulls = 0;
            }
        }
        pos.length -= consecNulls;
        return pos;
    }

    putBack(pos=null) {
        this._moveItemsToInventory(false);
        this._destroyBins();
        this.history = [];
        disableUndoButton();
        if(pos === null) {
            pos = [];
        }
        this._createBinsAndPackItems(pos);
    }

    addBins(nBin) {
        for(var i=0; i<nBin; ++i) {
            var bin = new BinUI(this.level.binXLen, this.level.binYLen, false,
                this.bins.length, this.scaleFactor);
            this.bins.push(bin);
            let packingArea = document.getElementById('packing-area');
            packingArea.appendChild(bin.domElem);
        }
    }

    trimBins(targetEmpty) {
        var nEmpty = 0;
        var nBins = this.bins.length;
        for(; nEmpty < nBins && this.bins[nBins - nEmpty - 1].bin.isEmpty(); ++nEmpty);

        if(nEmpty < targetEmpty) {
            this.addBins(targetEmpty - nEmpty);
        }
        else {
            for(var i=1; i <= nEmpty - targetEmpty; ++i) {
                this.bins[nBins - i].destroy();
            }
            this.bins.length = nBins - nEmpty + targetEmpty;
        }
    }

    undo() {
        if(this.history.length === 0) {
            return;
        }
        const record = this.history.pop();
        var item = this.items[record.itemId];
        var coords = record.oldCoords;

        if(coords === null) {
            this._moveItemToInventory(record.itemId);
            this.trimBins(1);
        }
        else if(coords[0] >= this.bins.length) {
            this.addBins(coords[0] + 1 - this.bins.length);
            item.detach();
            item.attach(this.bins[coords[0]], coords[1], coords[2]);
        }
        else {
            // check if moving will cause clash. If yes, invalidate history and warn.
            var bin = this.bins[coords[0]];
            var currCoords = item.coords();
            var newPosRect = new Rectangle(coords[1], coords[2],
                item.itemInfo.xLen, item.itemInfo.yLen);
            item.detach();
            if(bin.bin.canFit(newPosRect)) {
                item.attach(bin, coords[1], coords[2]);
                this.trimBins(1);
            }
            else {
                if(currCoords !== null) {
                    item.attach(this.bins[currCoords[0]], currCoords[1], currCoords[2]);
                }
                console.warn('undo failed: cannot move item ' + record.itemId
                    + ' to position ' + coords + '; invalidating history');
                this.history = [];
            }
        }
        if(this.history.length === 0) {
            disableUndoButton();
        }
    }

    selectSolution(algoName) {
        var solutions = this.level.solutions;
        if(solutions[algoName] === undefined || solutions[algoName] === null) {
            solutions[algoName] = bpAlgos[algoName](this.level.items, this.level.binXLen,
                this.level.binYLen, []);
        }
        this.putBack(solutions[algoName]);
    }

    resize(scaleFactor) {
        this._setScaleFactor(scaleFactor);
        for(let bin of this.bins) {
            bin.resize(this.scaleFactor);
        }
        for(var i=0; i < this.items.length; ++i) {
            let item = this.items[i];
            item.resize(this.scaleFactor);
            if(item.binUI === null) {
                this._moveItemToInventory(i);
            }
        }
    }

    destroy() {
        this._destroyItems();
        this._destroyBins();
        this._setInventoryDimsPx(0, 0);
        arena.classList.remove('large');
        this.history = [];
        disableUndoButton();
        this.stats.destroy();
        this.itemInfoBar.destroy();
        this.level = null;
        this.stripPackSol = null;
        inventory.style.backgroundSize = null;
    }

    _assessBins() {
        var lb = this.level.lower_bound, ub = this.level.upper_bound;
        var used = 0;
        for(var i=0; i<this.bins.length; ++i) {
            var bin = this.bins[i];
            if(!bin.bin.isEmpty()) {
                used += 1
                var binType = 'good';
                if(used > ub) {
                    binType = 'danger';
                }
                else if(used > lb) {
                    binType = 'warning';
                }
                bin.domElem.setAttribute('data-bin-type', binType);
            }
            else {
                bin.domElem.removeAttribute('data-bin-type', binType);
            }
        }
    }

    _recordHistory(itemId, oldCoords, newCoords) {
        if(!arraysEqual(oldCoords, newCoords)) {
            this.history.push({'itemId': itemId, 'oldCoords': oldCoords, 'newCoords': newCoords});
        }
        if(this.history.length > 0) {
            enableUndoButton();
        }
    }

    _computeInventoryDimsAndItemHomePositions() {
        var maxXLen = 0;
        var rawItems = this.level.items;
        for(var item of rawItems) {
            maxXLen = Math.max(maxXLen, item.xLen);
        }
        const origInvXLen = Math.max(maxXLen, this.level.binXLen);
        this.stripPackSol = nfdhStripPack(rawItems, origInvXLen, []);
        [this.invXLen, this.invYLen] = getStripDims(rawItems, this.stripPackSol);
    }

    _setScaleFactor(scaleFactor) {
        let [inferredScaleX, inferredScaleY] = inferScaleFactors(
            this.invXLen, this.invYLen, this.level.binXLen, this.level.binYLen,
            this.level.lower_bound);
        if(scaleFactor === 'x') {
            this.scaleFactor = inferredScaleX;
        }
        else if(scaleFactor === 'y') {
            this.scaleFactor = inferredScaleY;
        }
        else if(scaleFactor === null) {
            this.scaleFactor = Math.min(inferredScaleX, inferredScaleY);
        }
        else {
            this.scaleFactor = scaleFactor;
        }
        var actualArenaWidth = (this.invXLen + this.level.binXLen) * this.scaleFactor + 4 * innerMargin;
        var spaceForArenaWidth = window.innerWidth - 2 * outerMargin;
        if(actualArenaWidth >= spaceForArenaWidth) {
            arena.classList.add('large');
        }
        else {
            arena.classList.remove('large');
        }
        this._setInventoryDimsPx();
    }

    _setInventoryDimsPx() {
        inventory.style.width = this.invXLen * this.scaleFactor + 'px';
        inventory.style.height = this.invYLen * this.scaleFactor + 'px';
        inventory.style.backgroundSize = this.scaleFactor + 'px ' + this.scaleFactor + 'px';
    }

    _createItems() {
        var rawItems = this.level.items;
        for(var i=0; i < rawItems.length; ++i) {
            var itemUI = new ItemUI(rawItems[i], this.scaleFactor);
            this.items.push(itemUI);
        }
        this._moveItemsToInventory(true);
    }

    _moveItemsToInventory(firstTime) {
        var xOff = inventory.getBoundingClientRect().x - arena.getBoundingClientRect().x;
        var yOff = inventory.getBoundingClientRect().y - arena.getBoundingClientRect().y;
        this.yAgg = 0;
        var n = this.items.length;
        for(var i=0; i<n; ++i) {
            var item = this.items[i];
            item.detach();
            if(firstTime) {
                inventory.appendChild(item.domElem);
            }
            setPos(item.domElem, xOff + this.stripPackSol[i][0] * this.scaleFactor,
                yOff + this.stripPackSol[i][1] * this.scaleFactor);
            this.yAgg += item.itemInfo.yLen;
        }
    }

    _moveItemToInventory(itemId) {
        var xOff = inventory.getBoundingClientRect().x - arena.getBoundingClientRect().x;
        var yOff = inventory.getBoundingClientRect().y - arena.getBoundingClientRect().y;
        var item = this.items[itemId];
        item.detach();
        setPos(item.domElem, xOff + this.stripPackSol[itemId][0] * this.scaleFactor,
            yOff + this.stripPackSol[itemId][1] * this.scaleFactor);
    }

    _createBinsAndPackItems(pos) {
        var binsNeeded = 1;
        var rawItems = this.level.items;
        for(var i=0; i < pos.length && i < rawItems.length; ++i) {
            if(pos[i] !== null && pos[i] !== undefined) {
                binsNeeded = Math.max(binsNeeded, pos[i][0] + 2);
            }
        }
        this.addBins(binsNeeded);

        // move items as per pos
        for(var i=0; i < pos.length && i < rawItems.length; ++i) {
            if(pos[i] !== null && pos[i] !== undefined) {
                let [binId, xPos, yPos] = pos[i];
                this.items[i].attach(this.bins[binId], xPos, yPos);
            }
        }
    }

    _destroyBins() {
        for(var bin of this.bins) {
            bin.destroy();
        }
        this.bins.length = 0;
    }

    _destroyItems() {
        this.yAgg = 0;
        for(var item of this.items) {
            item.detach();
            inventory.removeChild(item.domElem);
        }
        this.items.length = 0;
    }
}

function downloadProgress(filename='progress.json', cleanup=false) {
    var level = serializeLevel(game.level, game.getItemPositions());
    var blob = new Blob([JSON.stringify(level)], {type: 'application/json'});
    downloadBlob(blob, filename, cleanup);
}

function clearGame() {
    if(game !== null) {
        game.destroy();
        game = null;
    }
}

//==[ Event Handling ]==========================================================

class ItemInfoBar {
    constructor(gameType) {
        this.gameType = gameType;
        var domElemNames = ['width', 'height'];
        if(this.gameType == 'ks') {
            domElemNames.push('profit');
        }
        this.barDom = document.getElementById('item-info-bar');
        this.domElems = createBarItems(this.barDom, domElemNames);
    }

    activate(item) {
        var d = {'width': item.xLen, 'height': item.yLen, 'profit': item.profit};
        for(let [key, value] of Object.entries(d)) {
            var domElem = this.domElems[key];
            if(domElem !== undefined) {
                domElem.innerHTML = value;
            }
        }
        this.barDom.style.visibility = 'visible';
    }

    deactivate() {
        for(let [key, domElem] of Object.entries(this.domElems)) {
            domElem.innerHTML = '';
        }
        this.barDom.style.visibility = 'hidden';
    }

    destroy() {
        this.barDom.innerHTML = '';
        this.domElems = null;
    }
}

class DragData {
    constructor(itemId, coords, xOff, yOff) {
        this.itemId = itemId;
        this.coords = coords;
        this.xOff = xOff;
        this.yOff = yOff;
    }
    static get() {
        return globalDragData;
    }
    static set(dragData) {
        if(globalDragData !== null) {
            throw new Error('globalDragData is already set');
        }
        globalDragData = dragData;
        game.itemInfoBar.activate(game.items[dragData.itemId].itemInfo);
        // ev.dataTransfer.setData('text/html', null);
    }
    static unset() {
        globalDragData = null;
        game.itemInfoBar.deactivate();
    }
}

function mousedownHandler(ev) {
    var target = ev.target;
    console.debug(ev.type, ev.clientX, ev.clientY, target);
    if(target.classList.contains('item')) {
        ev.preventDefault();
        var itemDomElem = target;
        var originalXPos = itemDomElem.getBoundingClientRect().x;
        var originalYPos = itemDomElem.getBoundingClientRect().y;
        var itemXOff = ev.clientX - originalXPos;
        var itemYOff = ev.clientY - originalYPos;
        var itemId = parseInt(itemDomElem.getAttribute('data-item-id'));
        var item = game.items[itemId];
        DragData.set(new DragData(itemId, item.coords(), itemXOff, itemYOff));

        item.detach();
        var xPos = originalXPos - arena.getBoundingClientRect().x;
        var yPos = originalYPos - arena.getBoundingClientRect().y;
        setPos(item.domElem, xPos, yPos);
        hoverRect.style.height = itemDomElem.getBoundingClientRect().height + 'px';
        hoverRect.style.width = itemDomElem.getBoundingClientRect().width + 'px';
    }
}

function getPos(ev, xLen, yLen, bin) {
    var dragData = DragData.get();
    var binX = bin.domElem.getBoundingClientRect().x;
    var binY = bin.domElem.getBoundingClientRect().y;
    var xPos = (ev.clientX - binX - dragData.xOff) / game.scaleFactor;
    var yPos = (ev.clientY - binY - dragData.yOff) / game.scaleFactor;
    xPos = clip(Math.round(xPos), 0, bin.bin.xLen - xLen);
    yPos = clip(Math.round(yPos), 0, bin.bin.yLen - yLen);
    return [xPos, yPos];
}

function moveHoverRect(bin, rect) {
    if((rect.xPos + rect.xLen > bin.bin.xLen) || (rect.yPos + rect.yLen > bin.bin.yLen)) {
        hoverRect.style.visibility = 'hidden';
    }
    else {
        setPos(hoverRect,
            bin.domElem.getBoundingClientRect().x + rect.xPos * game.scaleFactor,
            bin.domElem.getBoundingClientRect().y + rect.yPos * game.scaleFactor);
        hoverRect.style.visibility = 'visible';
    }
}

function inRect(xPos, yPos, domRect) {
    return (domRect.left <= xPos && xPos <= domRect.right)
        && (domRect.top <= yPos && yPos <= domRect.bottom);
}

function getMouseBin(ev) {
    for(var bin of game.bins) {
        if(inRect(ev.clientX, ev.clientY, bin.domElem.getBoundingClientRect())) {
            return bin;
        }
    }
    return null;
}

function mousemoveHandler(ev) {
    // console.debug("mousemove", ev.target.id, ev.target.classList.value);
    ev.preventDefault();
    var dragData = DragData.get();
    if(dragData === null) {
        return;
    }

    // move item
    var item = game.items[dragData.itemId];
    var arenaX = arena.getBoundingClientRect().x;
    var arenaY = arena.getBoundingClientRect().y;
    setPos(item.domElem, ev.clientX - dragData.xOff - arenaX, ev.clientY - dragData.yOff - arenaY);

    // draw hover
    var bin = getMouseBin(ev);
    if(bin === null) {
        hoverRect.style.visibility = 'hidden';
    }
    else {
        let [xPos, yPos] = getPos(ev, item.itemInfo.xLen, item.itemInfo.yLen, bin);
        var newPosRect = new Rectangle(xPos, yPos, item.itemInfo.xLen, item.itemInfo.yLen);
        moveHoverRect(bin, newPosRect);
        if(bin.bin.canFit(newPosRect)) {
            hoverRect.classList.add('success');
            hoverRect.classList.remove('failure');
        }
        else {
            hoverRect.classList.add('failure');
            hoverRect.classList.remove('success');
        }
    }
}

function endDrag() {
    hoverRect.style.visibility = 'hidden';
    var dragData = DragData.get();
    if(dragData !== null) {
        var oldCoords = dragData.coords;
        var item = game.items[dragData.itemId];
        game._recordHistory(dragData.itemId, oldCoords, item.coords());
    }
    DragData.unset();
    game.trimBins(1);
}

function mouseupHandler(ev) {
    var target = ev.target;
    console.debug(ev.type, target);
    ev.preventDefault();
    var dragData = DragData.get();
    if(dragData === null) {
        return;
    }

    var itemId = dragData.itemId;
    var item = game.items[dragData.itemId]
    var bin = getMouseBin(ev);

    // attach item to bin
    if(bin !== null) {
        let [xPos, yPos] = getPos(ev, item.itemInfo.xLen, item.itemInfo.yLen, bin, bin.domElem);
        item.attach(bin, xPos, yPos);
    }

    endDrag();
}

function mouseleaveHandler(ev) {
    var target = ev.target;
    console.debug(ev.type, target);
    ev.preventDefault();
    var dragData = DragData.get();
    if(dragData !== null) {
        endDrag();
    }
}

function keydownHandler(ev) {
    if(handleKeyPresses && !ev.defaultPrevented) {
        if(ev.key == 'z' && (ev.metaKey || ev.ctrlKey)) {
            if(game !== null) {game.undo();}
            ev.preventDefault();
        }
    }
}


function addEventListeners() {
    arena.addEventListener('dragstart', function(ev) {
        console.debug('dragstart', ev.target);
        ev.preventDefault();
        return false;
    });

    arena.addEventListener('pointerdown', mousedownHandler);
    arena.addEventListener('pointermove', mousemoveHandler);
    arena.addEventListener('pointerup', mouseupHandler);
    arena.addEventListener('pointerleave', mouseleaveHandler);
    window.addEventListener('keydown', keydownHandler);

    document.getElementById('level-loader').addEventListener('change', function(ev) {
            loadGameFromFiles(ev.target.files, uploadInfo['scaleFactor'],
                uploadInfo['succHook'], uploadInfo['failHook']);
        });
    document.body.addEventListener('dragover', function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'copy';
        });
    document.body.addEventListener('drop', function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'copy';
            loadGameFromFiles(ev.dataTransfer.files, uploadInfo['scaleFactor'],
                uploadInfo['succHook'], uploadInfo['failHook']);
        });
}

//==[ Export ]==================================================================

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
    var pxInCm = window.outerWidth / 21;
    var margin = (innerMargin / 2 / pxInCm) + 'cm';
    var cellSize = (game.scaleFactor / pxInCm) + 'cm';
    return [cellSize, margin];
}

function binsToTikz(level, pos, options={}) {
    if(pos.length === 0) {
        console.warn('binsToTikz: no packed items.');
    }
    const n = level.items.length;
    let m = 0;
    let children = [];
    for(let i=0; i < pos.length && i < n; ++i) {
        let [binId, xPos, yPos] = pos[i];
        m = Math.max(m, binId+1);
        if(children[binId] === undefined) {
            children[binId] = [];
        }
        children[binId].push(i);
    }
    for(let j=0; j<m; ++j) {
        if(children[j] === undefined) {
            children[j] = [];
        }
    }

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
    for(let j=0; j<m; ++j) {
        lines.push('\\begin{tikzpicture}');
        lines.push('\\path (-\\pGameM, -\\pGameM) rectangle '
            + `(${level.binXLen}\\pGameL+\\pGameM, ${level.binYLen}\\pGameL+\\pGameM);`);
        lines.push('\\path[binGrid] (0\\pGameL, 0\\pGameL) grid '
            + `(${level.binXLen}\\pGameL, ${level.binYLen}\\pGameL);`);
        for(let i of children[j]) {
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
    var tikz = binsToTikz(game.level, game.getItemPositions(), options);
    var blob = new Blob([tikz], {type: 'application/x-tex'});
    downloadBlob(blob, filename, cleanup);
}

//==[ Main ]====================================================================

window.addEventListener('load', function() {
    addEventListeners();
    loadGameFromQParams(getQParams());
    populateNgForm();
    addExtraUIEventListeners();
});
