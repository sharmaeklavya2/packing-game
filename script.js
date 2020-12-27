'use strict';

var arenaWrapper = document.getElementById('arena-wrapper');
var arena = document.getElementById('arena');
var inventory = document.getElementById('inventory');
var packingArea = document.getElementById('packing-area');
var hoverRect = document.getElementById('hover-rect');
var statsBar = document.getElementById('stats-bar');
var itemInfoBar = document.getElementById('item-info-bar');
var levelLoaderElem = document.getElementById('level-loader');
var downloaderElem = document.getElementById('downloader');
var newGameButton = document.getElementById('new-game-button');
var undoButton = document.getElementById('undo-button');
var saveGameButton = document.getElementById('save-game-button');
var aboutButton = document.getElementById('about-button');
var ngForm = document.getElementById('ng-form');

var uiMargin = 10;  // margin between arena and the elements inside it, in px.
var defaultItemColor = 'blue';

var handleKeyPresses = true;
var globalGame = null;
var globalDragData = null;
var uploadInfo = {'scaleFactor': null, 'succHook': null, 'failHook': null};

var aboutText = "This is a 2D geometric bin-packing game. You have to pack all items from "
    + "the left side into the minimum number of bins on the right side.";

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
    constructor(xLen, yLen, profit, color) {
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

function addDefault(d, defaultValues) {
    for(let [k, v] of Object.entries(defaultValues)) {
        if(d[k] === undefined) {
            d[k] = v;
        }
    }
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

function readObjectPropsWithAssert(input, reqProps, optProps) {
    var o = {};
    for(var prop of reqProps) {
        if(input.hasOwnProperty(prop)) {
            o[prop] = input[prop];
        }
        else {
            throw new InputError(prop + ' is missing');
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

function itemInfoFromObject(j) {
    var reqProps = ['xLen', 'yLen'];
    var optProps = {'color': null, 'profit': 0};
    var o = readObjectPropsWithAssert(j, reqProps, optProps);
    return new ItemInfo(o['xLen'], o['yLen'], o['profit'], o['color']);
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
    var optProps = {'gameType': 'bp', 'startPos': [], 'rotation': false, 'expectation': null};
    var o = readObjectPropsWithAssert(j, reqProps, optProps);
    var items = [];
    console.assert(o.gameType === 'bp', "the only supported gameType is bp");
    for(var itemObj of o['items']) {
        var n = itemObj.n;
        if(n === undefined) {
            n = 1;
        }
        for(var i=0; i<n; ++i) {
            var item = itemInfoFromObject(itemObj);
            items.push(item);
        }
    }
    o.items = items;
    return o;
}

function serItemsEqual(a, b) {
    return (a.xPos === b.xPos && a.yPos === b.yPos
        && a.profit === b.profit && a.color === b.color);
}

function serializeLevel(level, pos=null) {
    var o = {"binXLen": level.binXLen, "binYLen": level.binYLen, "gameType": level.gameType,
        "rotation": level.rotation};
    if(level.expectation !== null) {o['expectation'] = level.expectation;}
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
    constructor(itemInfo, id, scaleFactor) {
        this.itemInfo = itemInfo;
        this.xPos = null;
        this.yPos = null;
        this.id = id;
        this.binUI = null;
        this.scaleFactor = scaleFactor;

        // DOM
        var elem = document.createElement('div');
        elem.classList.add('item');
        elem.setAttribute('data-item-id', this.id);
        elem.style.width = this.scaleFactor * this.itemInfo.xLen + 'px';
        elem.style.height = this.scaleFactor * this.itemInfo.yLen + 'px';
        if(itemInfo.color !== null) {
            elem.style.backgroundColor = itemInfo.color;
        }
        else {
            elem.style.backgroundColor = defaultItemColor;
        }
        this.domElem = elem;
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
            globalGame.stats.reportDetach(this.itemInfo, this.binUI.bin.isEmpty());
            this.binUI = null;
            inventory.appendChild(this.domElem);
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
            globalGame.stats.reportAttach(this.itemInfo, wasEmpty);
            this.binUI.domElem.appendChild(this.domElem);
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
        this.scaleFactor = scaleFactor;

        var elem = document.createElement('div');
        elem.classList.add('bin');
        elem.setAttribute('data-bin-id', this.id);
        elem.style.width = this.bin.xLen * this.scaleFactor + 'px';
        elem.style.height = this.bin.yLen * this.scaleFactor + 'px';
        elem.style.backgroundSize = this.scaleFactor + 'px ' + this.scaleFactor + 'px';
        this.domElem = elem;
    }
    destroy() {
        if(this.bin.isEmpty()) {
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
    constructor(gameType, items) {
        // items are ItemInfo objects
        this.gameType = gameType;
        this.nItems = 0;
        this.nItemsPacked = 0;
        this.nBins = 0;
        this.profit = 0;
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
    }

    destroy() {
        statsBar.innerHTML = '';
        this.domElems = null;
    }
}

function disableUndoButton() {
    undoButton.classList.add('disabled');
    undoButton.classList.remove('enabled');
}
function enableUndoButton() {
    undoButton.classList.remove('disabled');
    undoButton.classList.add('enabled');
}

class Game {
    constructor(level, scaleFactor=null) {
        globalGame = this;
        this.level = level;
        this.stats = new Stats(this.level.gameType, this.level.items);
        this.itemInfoBar = new ItemInfoBar(this.level.gameType);
        this.history = [];

        // get inventory's dimensions
        var maxXLen = 0;
        var inputItems = this.level.items;
        for(var item of inputItems) {
            maxXLen = Math.max(maxXLen, item.xLen);
        }
        var invXLen = Math.max(maxXLen, this.level.binXLen);
        let [invYLen, nextFitSol] = nfdhStrip(inputItems, invXLen);
        this.nextFitSol = nextFitSol;

        if(scaleFactor === null) {
            // infer scaleFactor from arenaWrapper's dims
            var arenaX = arenaWrapper.getBoundingClientRect().width;
            var arenaY = arenaWrapper.getBoundingClientRect().height;
            var scaleX = (arenaX - 4 * uiMargin) / (invXLen + this.level.binXLen);
            var scaleY = (arenaY - 2 * uiMargin) / invYLen;
            console.debug("inferred scale:", scaleX, scaleY);
            this.scaleFactor = Math.min(scaleX, scaleY);
        }
        else {
            this.scaleFactor = scaleFactor;
            var expectedArenaX = (invXLen + this.level.binXLen) * this.scaleFactor + 4 * uiMargin;
            var arenaWrapperX = arenaWrapper.getBoundingClientRect().width;
            if(expectedArenaX >= arenaWrapperX) {
                arena.classList.add('large');
            }
        }

        // set inventory's dimensions
        this._setInventoryDims(invXLen, invYLen);
        inventory.style.backgroundSize = this.scaleFactor + 'px ' + this.scaleFactor + 'px';

        // create items
        this.items = [];
        for(var i=0; i < inputItems.length; ++i) {
            var itemUI = new ItemUI(inputItems[i], i, this.scaleFactor);
            this.items.push(itemUI);
        }
        this._moveItemsToInventory(true);

        // create bins and position items
        this.bins = [];
        this._createBinsAndPositionItems(this.level.startPos);
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

    addBins(nBin) {
        for(var i=0; i<nBin; ++i) {
            var bin = new BinUI(this.level.binXLen, this.level.binYLen, false,
                this.bins.length, this.scaleFactor);
            this.bins.push(bin);
            packingArea.appendChild(bin.domElem);
        }
    }

    _setInventoryDims(xLen, yLen) {
        this.invXLen = xLen;
        this.invYLen = yLen;
        inventory.style.width = xLen * this.scaleFactor + 'px';
        inventory.style.height = yLen * this.scaleFactor + 'px';
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
            setPos(item.domElem, xOff + this.nextFitSol[i][0] * this.scaleFactor,
                yOff + this.nextFitSol[i][1] * this.scaleFactor);
            this.yAgg += item.itemInfo.yLen;
        }
    }

    _moveItemToInventory(itemId) {
        var xOff = inventory.getBoundingClientRect().x - arena.getBoundingClientRect().x;
        var yOff = inventory.getBoundingClientRect().y - arena.getBoundingClientRect().y;
        var item = this.items[itemId];
        item.detach();
        setPos(item.domElem, xOff + this.nextFitSol[itemId][0] * this.scaleFactor,
            yOff + this.nextFitSol[itemId][1] * this.scaleFactor);
    }

    _createBinsAndPositionItems(pos) {
        var binsNeeded = 1;
        var inputItems = this.level.items;
        for(var i=0; i < pos.length && i < inputItems.length; ++i) {
            if(pos[i] !== null && pos[i] !== undefined) {
                binsNeeded = Math.max(binsNeeded, pos[i][0] + 2);
            }
        }
        this.addBins(binsNeeded);

        // move items as per pos
        for(var i=0; i < pos.length && i < inputItems.length; ++i) {
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

    putBack(pos=null) {
        this._moveItemsToInventory(false);
        this._destroyBins();
        this.history = [];
        disableUndoButton();
        if(pos === null) {
            pos = [];
        }
        this._createBinsAndPositionItems(pos);
    }

    _recordHistory(itemId, oldCoords, newCoords) {
        if(!arraysEqual(oldCoords, newCoords)) {
            this.history.push({'itemId': itemId, 'oldCoords': oldCoords, 'newCoords': newCoords});
        }
        if(this.history.length > 0) {
            enableUndoButton();
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
            this._moveItemToInventory(item.id);
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
                console.warn('undo failed: cannot move item ' + item.id
                    + ' to position ' + coords + '; invalidating history');
                this.history = [];
            }
        }
        if(this.history.length === 0) {
            disableUndoButton();
        }
    }

    _destroyItems() {
        this.yAgg = 0;
        for(var item of this.items) {
            item.detach();
            inventory.removeChild(item.domElem);
        }
        this.items.length = 0;
    }

    destroy() {
        this._destroyItems();
        this._destroyBins();
        this._setInventoryDims(0, 0);
        arena.classList.remove('large');
        this.history = [];
        disableUndoButton();
        this.stats.destroy();
        this.itemInfoBar.destroy();
        this.level = null;
        this.nextFitSol = null;
        inventory.style.backgroundSize = null;
    }
}

function downloadProgress(filename='progress.json', cleanup=false) {
    var level = serializeLevel(globalGame.level, globalGame.getItemPositions());
    var blob = new Blob([JSON.stringify(level)], {type: 'application/json'});
    downloadBlob(blob, filename, cleanup);
}

class ItemInfoBar {
    constructor(gameType) {
        this.gameType = gameType;
        var domElemNames = ['width', 'height'];
        if(this.gameType == 'ks') {
            domElemNames.push('profit');
        }
        this.domElems = createBarItems(itemInfoBar, domElemNames);
    }

    activate(item) {
        var d = {'width': item.xLen, 'height': item.yLen, 'profit': item.profit};
        for(let [key, value] of Object.entries(d)) {
            var domElem = this.domElems[key];
            if(domElem !== undefined) {
                domElem.innerHTML = value;
            }
        }
        itemInfoBar.style.visibility = 'visible';
    }

    deactivate() {
        for(let [key, domElem] of Object.entries(this.domElems)) {
            domElem.innerHTML = '';
        }
        itemInfoBar.style.visibility = 'hidden';
    }

    destroy() {
        itemInfoBar.innerHTML = '';
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
        globalGame.itemInfoBar.activate(globalGame.items[dragData.itemId].itemInfo);
        // ev.dataTransfer.setData('text/html', null);
    }
    static unset() {
        globalDragData = null;
        globalGame.itemInfoBar.deactivate();
    }
}

function restartGame(newScaleFactor=null) {
    var level = globalGame.level;
    globalGame.destroy();
    globalGame = new Game(level, newScaleFactor);
}

function clearGame() {
    if(globalGame !== null) {
        globalGame.destroy();
        globalGame = null;
    }
}

//==[ Event Handlers ]==========================================================

function mousedownHandler(ev) {
    var target = ev.target;
    console.debug(ev.type, ev.clientX, ev.clientY, target);
    ev.preventDefault();
    if(target.classList.contains('item')) {
        var itemDomElem = target;
        var originalXPos = itemDomElem.getBoundingClientRect().x;
        var originalYPos = itemDomElem.getBoundingClientRect().y;
        var itemXOff = ev.clientX - originalXPos;
        var itemYOff = ev.clientY - originalYPos;
        var itemId = parseInt(itemDomElem.getAttribute('data-item-id'));
        var item = globalGame.items[itemId];
        DragData.set(new DragData(itemId, item.coords(), itemXOff, itemYOff));

        item.detach();
        var xPos = originalXPos - arena.getBoundingClientRect().x;
        var yPos = originalYPos - arena.getBoundingClientRect().y;
        setPos(item.domElem, xPos, yPos);
        hoverRect.style.height = itemDomElem.getBoundingClientRect().height + 'px';
        hoverRect.style.width = itemDomElem.getBoundingClientRect().width + 'px';
    }
}

function getPos(ev, xLen, yLen, bin, binDomElem) {
    var dragData = DragData.get();
    var binX = binDomElem.getBoundingClientRect().x;
    var binY = binDomElem.getBoundingClientRect().y;
    var xPos = (ev.clientX - binX - dragData.xOff) / bin.scaleFactor;
    var yPos = (ev.clientY - binY - dragData.yOff) / bin.scaleFactor;
    xPos = clip(Math.round(xPos), 0, bin.bin.xLen-xLen);
    yPos = clip(Math.round(yPos), 0, bin.bin.yLen-yLen);
    return [xPos, yPos];
}

function moveHoverRect(bin, binDomElem, rect) {
    if((rect.xPos + rect.xLen > bin.bin.xLen) || (rect.yPos + rect.yLen > bin.bin.yLen)) {
        hoverRect.style.visibility = 'hidden';
    }
    else {
        setPos(hoverRect,
            binDomElem.getBoundingClientRect().x + rect.xPos * bin.scaleFactor,
            binDomElem.getBoundingClientRect().y + rect.yPos * bin.scaleFactor);
        hoverRect.style.visibility = 'visible';
    }
}

function inRect(xPos, yPos, domRect) {
    return (domRect.left <= xPos && xPos <= domRect.right)
        && (domRect.top <= yPos && yPos <= domRect.bottom);
}

function getMouseBin(ev) {
    for(var bin of globalGame.bins) {
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
    var item = globalGame.items[dragData.itemId];
    var arenaX = arena.getBoundingClientRect().x;
    var arenaY = arena.getBoundingClientRect().y;
    setPos(item.domElem, ev.clientX - dragData.xOff - arenaX, ev.clientY - dragData.yOff - arenaY);

    // draw hover
    var bin = getMouseBin(ev);
    if(bin === null) {
        hoverRect.style.visibility = 'hidden';
    }
    else {
        var binDomElem = bin.domElem;
        let [xPos, yPos] = getPos(ev, item.itemInfo.xLen, item.itemInfo.yLen, bin, binDomElem);
        var newPosRect = new Rectangle(xPos, yPos, item.itemInfo.xLen, item.itemInfo.yLen);
        moveHoverRect(bin, binDomElem, newPosRect);
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
        var item = globalGame.items[dragData.itemId];
        globalGame._recordHistory(dragData.itemId, oldCoords, item.coords());
    }
    DragData.unset();
    globalGame.trimBins(1);
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
    var item = globalGame.items[dragData.itemId]
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
            globalGame.undo();
            ev.preventDefault();
        }
    }
}


function ngFormSuccess() {
    ngForm.classList.add('disabled');
    ngForm.classList.remove('enabled');
    ngForm.classList.remove('loading');
    newGameButton.classList.remove('pressed');
}

function ngFormSubmitHandler(ev) {
    ev.preventDefault();
    const formData = new FormData(ngForm);
    var choice = formData.get('ng-choice');
    let [srctype, src] = choice.split(':');
    ngForm.classList.add('loading');
    if(srctype == 'upload') {
        loadGameFromUpload();
        ngFormSuccess();
        window.history.replaceState({}, null, '?');
    }
    else if(srctype == 'url') {
        loadGameFromUrl(src, null, ngFormSuccess);
        var qs = toQueryString({'srctype': srctype, 'src': src});
        window.history.replaceState({}, null, '?' + qs);
    }
    else if(srctype == 'gen') {
        loadGameFromGen(src, {}, null, ngFormSuccess);
        var qs = toQueryString({'srctype': srctype, 'src': src});
        window.history.replaceState({}, null, '?' + qs);
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

    levelLoaderElem.addEventListener('change', function(ev) {
            loadGameFromFiles(ev.target.files, uploadInfo['scaleFactor'],
                uploadInfo['succHook'], uploadInfo['failHook']);
        });
    arenaWrapper.addEventListener('dragover', function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'copy';
        });
    arenaWrapper.addEventListener('drop', function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'copy';
            loadGameFromFiles(ev.dataTransfer.files, uploadInfo['scaleFactor'],
                uploadInfo['succHook'], uploadInfo['failHook']);
        });
    undoButton.addEventListener('click', function(ev) {
            if(globalGame !== null) {globalGame.undo();}
        });
    saveGameButton.addEventListener('click', function(ev) {
            if(globalGame !== null) {downloadProgress();}
        });
    aboutButton.addEventListener('click', function(ev) {
            window.alert(aboutText);
        });
    newGameButton.addEventListener('click', function(ev) {
            ngForm.classList.toggle('disabled');
            ngForm.classList.toggle('enabled');
            ngForm.classList.remove('loading');
            newGameButton.classList.toggle('pressed');
        });
    ngForm.addEventListener('submit', ngFormSubmitHandler);
}

//==[ Main ]====================================================================

function main() {
    addEventListeners();
    loadGameFromQParams(getQParams());
}
