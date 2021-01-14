'use strict';

var arena = document.getElementById('arena');
var inventory = document.getElementById('inventory');
var hoverRect = document.getElementById('hover-rect');

var innerMargin = 10;  // margin between arena and the elements inside it, in px.
var outerMargin = 32;  // margin between arena and containing page.
var defaultItemColor = 'hsl(210,100%,60%)';

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
}

function array2d(m, n, x) {
/* create m-length list containing n-length lists of element x */
    let arr = [];
    for(let i=0; i<m; ++i) {
        arr.push(new Array(n).fill(x));
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
        return this.count === 0;
    }

    insert(rect) {
        this.count += 1;
        return true;
    }

    remove(rect) {
        if(this.count === 0) {
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
        let minX = Math.min(rect.xPos + rect.xLen, this.xLen);
        let minY = Math.min(rect.yPos + rect.yLen, this.yLen);
        return this._getAggFilled(minX, minY)
            - this._getAggFilled(rect.xPos, minY)
            - this._getAggFilled(minX, rect.yPos)
            + this._getAggFilled(rect.xPos, rect.yPos);
    }
    isEmpty() {
        return this._getAggFilled(this.xLen, this.yLen) === 0;
    }

    _fill(rect, z) {
        console.assert(rect.xPos + rect.xLen <= this.xLen, '_fill: x overflow');
        console.assert(rect.yPos + rect.yLen <= this.yLen, '_fill: y overflow');
        for(let i=1; i <= rect.yLen; ++i) {
            let y = rect.yPos + i;
            for(let j=1; j <= rect.xLen; ++j) {
                this._incAggFilled(rect.xPos + j, y, i * j * z);
            }
            for(let x = rect.xPos + rect.xLen + 1; x <= this.xLen; ++x) {
                this._incAggFilled(x, y, i * rect.xLen * z);
            }
        }
        for(let y = rect.yPos + rect.yLen + 1; y <= this.yLen; ++y) {
            for(let j=1; j <= rect.xLen; ++j) {
                this._incAggFilled(rect.xPos + j, y, rect.yLen * j * z);
            }
            let a = rect.yLen * rect.xLen;
            for(let x = rect.xPos + rect.xLen + 1; x <= this.xLen; ++x) {
                this._incAggFilled(x, y, a * z);
            }
        }
    }

    canFit(rect) {
        if((rect.xPos + rect.xLen > this.xLen) || (rect.yPos + rect.yLen > this.yLen)) {
            return false;
        }
        return this.getFilledArea(rect) === 0;
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

    area() {
        return this.xLen * this.yLen;
    }
}

class ItemSetStats {
    constructor(count=0, area=0, profit=0) {
        this.count = count;
        this.area = area;
        this.profit = profit;
    }
    add(itemInfo) {
        this.count += 1;
        this.area += itemInfo.area();
        this.profit += itemInfo.profit;
    }
    remove(itemInfo) {
        this.count -= 1;
        this.area -= itemInfo.area();
        this.profit -= itemInfo.profit;
    }
}

//==[ Util ]====================================================================

function arraysEqual(a, b) {
    if(a === b) {return true;}
    if(a === null || b === null) {return false;}
    if(a.length !== b.length) {return false;}
    for(let i = 0; i < a.length; ++i) {
        if(a[i] !== b[i]) {return false;}
    }
    return true;
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
        this.domElem.style.width = scaleFactor * this.itemInfo.xLen + 'px';
        this.domElem.style.height = scaleFactor * this.itemInfo.yLen + 'px';
        if(this.binUI !== null) {
            setPos(this.domElem, scaleFactor * this.xPos, scaleFactor * this.yPos);
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
    let domElems = {};
    for(let name of names) {
        let entryDom = document.createElement('div');
        entryDom.classList.add('bar-entry');
        let labelDom = document.createElement('div');
        labelDom.classList.add('bar-label');
        labelDom.innerHTML = name;
        let valueDom = document.createElement('div');
        valueDom.classList.add('bar-value');
        domElems[name] = valueDom;
        entryDom.appendChild(labelDom);
        entryDom.appendChild(valueDom);
        domParent.appendChild(entryDom);
    };
    return domElems;
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
        this.level = level;
        this._computeInventoryDimsAndItemHomePositions();
        this._computeAutoPack('ffdh-ff');
        this._computeAutoPack('ffdh-ff-mirror');
        this._improveLowerBound();

        this.itemInfoBar = new ItemInfoBar(this.level.gameType);
        this.history = [];
        this.historyLength = 0;
        this.bins = [];
        this.items = [];
        this.totalStats = new ItemSetStats();
        this.packedStats = new ItemSetStats();
        this.nBinsUsed = 0;

        this._setScaleFactor(scaleFactor);
        this._createStatsBar();
        this._createItems();
        this._createBinsAndPackItems(this.level.startPos);
        this._refreshStatsDom();
        repopulateSolveMenu(this.level.solutions);
    }

    getItemPosition(itemId) {
        let item = this.items[itemId];
        if(item.binUI !== null) {
           return [item.binUI.id, item.xPos, item.yPos];
        }
        else {
            return null;
        }
    }

    getItemPositions() {
        let pos = [];
        let consecNulls = 0;
        for(let i=0; i < this.items.length; ++i) {
            let coords = this.getItemPosition(i);
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
        this._invalidateHistory();
        if(pos === null) {
            pos = [];
        }
        this._createBinsAndPackItems(pos);
    }

    addBins(nBin) {
        for(let i=0; i<nBin; ++i) {
            let bin = new BinUI(this.level.binXLen, this.level.binYLen, false,
                this.bins.length, this.scaleFactor);
            this.bins.push(bin);
            let packingArea = document.getElementById('packing-area');
            packingArea.appendChild(bin.domElem);
        }
    }

    trimBins(targetEmpty) {
        let nEmpty = 0;
        let nBins = this.bins.length;
        for(; nEmpty < nBins && this.bins[nBins - nEmpty - 1].bin.isEmpty(); ++nEmpty);

        if(nEmpty < targetEmpty) {
            this.addBins(targetEmpty - nEmpty);
        }
        else {
            for(let i=1; i <= nEmpty - targetEmpty; ++i) {
                this.bins[nBins - i].destroy();
            }
            this.bins.length = nBins - nEmpty + targetEmpty;
        }
    }

    detach(itemId) {
        let item = this.items[itemId];
        if(item.binUI !== null) {
            item.binUI.bin.remove(new Rectangle(item.xPos, item.yPos,
                item.itemInfo.xLen, item.itemInfo.yLen));
            item.binUI.domElem.removeChild(item.domElem);
            item.domElem.classList.remove('packed');
            this.packedStats.remove(item.itemInfo);
            if(item.binUI.bin.isEmpty()) {
                this.nBinsUsed--;
            }
            item.binUI = null;
            inventory.appendChild(item.domElem);
            this._assessBins();
            this._refreshStatsDom();
        }
    }

    attach(itemId, binId, xPos, yPos) {
        let item = this.items[itemId];
        let binUI = this.bins[binId];
        if(binUI === undefined) {
            throw new Error('Cannot attach item ' + itemId
                + '; bin ' + binId + ' does not exist.');
        }
        console.assert(item.binUI === null, 'item ' + itemId
            + ' is already attached to bin ' + binId);
        let wasEmpty = binUI.bin.isEmpty();
        if(binUI.bin.insert(new Rectangle(xPos, yPos, item.itemInfo.xLen, item.itemInfo.yLen))) {
            item.binUI = binUI;
            item.xPos = xPos;
            item.yPos = yPos;
            item.domElem.classList.add('packed');
            setPos(item.domElem, this.scaleFactor * xPos, this.scaleFactor * yPos);
            this.packedStats.add(item.itemInfo);
            if(wasEmpty) {
                this.nBinsUsed++;
            }
            item.binUI.domElem.appendChild(item.domElem);
            this._assessBins();
            this._refreshStatsDom();
            return true;
        }
        else {
            return false;
        }
    }

    undo() {this._undoOrRedo(true);}
    redo() {this._undoOrRedo(false);}

    _undoOrRedo(undo) {
        if(undo && this.historyLength === 0) {
            return;
        }
        if(!undo && this.historyLength === this.history.length) {
            return;
        }

        let record, coords;
        if(undo) {
            record = this.history[--this.historyLength];
            coords = record.oldCoords;
        }
        else {
            record = this.history[this.historyLength++];
            coords = record.newCoords;
        }
        const item = this.items[record.itemId];

        if(coords === null) {
            this._moveItemToInventory(record.itemId);
            this.trimBins(1);
        }
        else if(coords[0] >= this.bins.length) {
            this.addBins(coords[0] + 1 - this.bins.length);
            this.detach(record.itemId);
            this.attach(record.itemId, coords[0], coords[1], coords[2]);
        }
        else {
            // check if moving will cause clash. If yes, invalidate history and warn.
            let bin = this.bins[coords[0]];
            let currCoords = this.getItemPosition(record.itemId);
            let newPosRect = new Rectangle(coords[1], coords[2],
                item.itemInfo.xLen, item.itemInfo.yLen);
            this.detach(record.itemId);
            if(bin.bin.canFit(newPosRect)) {
                this.attach(record.itemId, coords[0], coords[1], coords[2]);
                this.trimBins(1);
            }
            else {
                if(currCoords !== null) {
                    this.attach(record.itemId, currCoords[0], currCoords[1], currCoords[2]);
                }
                console.warn('undo failed: cannot move item ' + record.itemId
                    + ' to position ' + coords + '; invalidating history');
                this.history = [];
                this.historyLength = 0;
            }
        }
        if(this.historyLength === 0) {
            disableUndoButton();
        }
        if(this.historyLength === this.history.length) {
            disableRedoButton();
        }
        else {
            enableRedoButton();
        }
    }

    selectAutoPack(algoName) {
        let autoPack = this.level.autoPack;
        if(autoPack.get(algoName) === undefined) {
            this._computeAutoPack(algoName);
        }
        this.putBack(autoPack.get(algoName));
    }

    selectSolution(solnName) {
        this.putBack(this.level.solutions.get(solnName));
    }

    resize(scaleFactor) {
        this._setScaleFactor(scaleFactor);
        for(let bin of this.bins) {
            bin.resize(this.scaleFactor);
        }
        for(let i=0; i < this.items.length; ++i) {
            let item = this.items[i];
            item.resize(this.scaleFactor);
            if(item.binUI === null) {
                this._moveItemToInventory(i);
            }
        }
    }

    lowerBound() {
        if(this.level.origLB === null) {
            return this.level.computedLB;
        }
        else {
            return Math.max(this.level.computedLB, this.level.origLB);
        }
    }
    upperBound() {
        if(this.level.origUB === null) {
            return this.level.computedUB;
        }
        else {
            return Math.min(this.level.computedUB, this.level.origUB);
        }
    }

    destroy() {
        this._destroyItems();
        this._destroyBins();
        this.invXLen = 0;
        this.invYLen = 0;
        this._setInventoryDimsPx();
        arena.classList.remove('large');
        this._invalidateHistory();
        this.totalStats = null;
        this.packedStats = null;
        this._destroyStatsBar();
        this.itemInfoBar.destroy();
        this.level = null;
        this.stripPackSol = null;
        inventory.style.backgroundSize = null;
    }

    _invalidateHistory() {
        this.history = [];
        this.historyLength = 0;
        disableUndoButton();
        disableRedoButton();
    }

    _computeAutoPack(algoName) {
        let algo = bpAlgos.get(algoName);
        let level = this.level;
        let packing = algo(level.items, level.binXLen, level.binYLen, []);
        level.autoPack.set(algoName, packing);
        const nBins = countUsedBins(packing);
        level.autoPackNBins.set(algoName, nBins);
        if(nBins < level.computedUB) {
            level.computedUBReason = algoName;
            level.computedUB = nBins;
        }
    }

    _improveLowerBound() {
        let level = this.level;
        const [newLB, newLBReason] = bpLowerBound(level.items, level.binXLen, level.binYLen, false);
        if(newLB > level.computedLB) {
            level.computedLBReason = newLBReason;
            level.computedLB = newLB;
        }
    }

    _refreshStatsDom() {
        let d = {
            'packed': this.packedStats.count,
            'unpacked': this.items.length - this.packedStats.count,
            'bins used': this.nBinsUsed,
            'profit': this.packedStats.profit,
        };
        for(let [key, value] of Object.entries(d)) {
            let domElem = this.statsDomElems[key];
            if(domElem !== undefined) {
                domElem.innerHTML = value;
            }
        }
        if(d['unpacked'] === 0) {
            this.statsDomElems['packed'].classList.add('success');
            this.statsDomElems['unpacked'].classList.add('success');
        }
        else {
            this.statsDomElems['packed'].classList.remove('success');
            this.statsDomElems['unpacked'].classList.remove('success');
        }
        let binsUsedDomElem = this.statsDomElems['bins used'];
        binsUsedDomElem.classList.remove('success', 'error', 'warning');
        if(this.nBinsUsed > this.upperBound()) {
            binsUsedDomElem.classList.add('error');
        }
        else if(this.nBinsUsed > this.lowerBound()) {
            binsUsedDomElem.classList.add('warning');
        }
        else {
            binsUsedDomElem.classList.add('success');
        }
    }

    _assessBins() {
        let lb = this.lowerBound(), ub = this.upperBound();
        let used = 0;
        for(let i=0; i<this.bins.length; ++i) {
            let bin = this.bins[i];
            if(!bin.bin.isEmpty()) {
                used += 1
                let binType = 'good';
                if(used > ub) {
                    binType = 'danger';
                }
                else if(used > lb) {
                    binType = 'warning';
                }
                bin.domElem.setAttribute('data-bin-type', binType);
            }
            else {
                bin.domElem.removeAttribute('data-bin-type');
            }
        }
    }

    _recordHistory(itemId, oldCoords, newCoords) {
        if(!arraysEqual(oldCoords, newCoords)) {
            this.history[this.historyLength++] = {'itemId': itemId,
                'oldCoords': oldCoords, 'newCoords': newCoords};
            this.history.length = this.historyLength;
        }
        if(this.history.length > 0) {
            enableUndoButton();
        }
        disableRedoButton();
    }

    _computeInventoryDimsAndItemHomePositions() {
        let maxXLen = 0;
        let rawItems = this.level.items;
        for(let item of rawItems) {
            maxXLen = Math.max(maxXLen, item.xLen);
        }
        const origInvXLen = Math.max(maxXLen, this.level.binXLen);
        this.stripPackSol = nfdhStripPack(rawItems, origInvXLen, []);
        [this.invXLen, this.invYLen] = getStripDims(rawItems, this.stripPackSol);
    }

    _setScaleFactor(scaleFactor) {
        let [inferredScaleX, inferredScaleY] = inferScaleFactors(
            this.invXLen, this.invYLen, this.level.binXLen, this.level.binYLen,
            this.lowerBound());
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
        let actualArenaWidth = (this.invXLen + this.level.binXLen) * this.scaleFactor + 4 * innerMargin;
        let spaceForArenaWidth = window.innerWidth - 2 * outerMargin;
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
        let rawItems = this.level.items;
        for(let i=0; i < rawItems.length; ++i) {
            let itemUI = new ItemUI(rawItems[i], this.scaleFactor);
            this.items.push(itemUI);
            this.totalStats.add(rawItems[i]);
        }
        this._moveItemsToInventory(true);
    }

    _createStatsBar() {
        let domElemNames = ['packed', 'unpacked'];
        if(this.level.gameType === 'bp') {
            domElemNames.push('bins used');
        }
        else if(this.level.gameType === 'ks') {
            domElemNames.push('profit');
        }
        this.statsDomElems = createBarItems(document.getElementById('stats-bar'), domElemNames);
    }

    _destroyStatsBar() {
        document.getElementById('stats-bar').innerHTML = '';
        this.statsDomElems = null;
    }

    _moveItemsToInventory(firstTime) {
        let xOff = inventory.getBoundingClientRect().x - arena.getBoundingClientRect().x;
        let yOff = inventory.getBoundingClientRect().y - arena.getBoundingClientRect().y;
        this.yAgg = 0;
        let n = this.items.length;
        for(let i=0; i<n; ++i) {
            let item = this.items[i];
            this.detach(i);
            if(firstTime) {
                inventory.appendChild(item.domElem);
            }
            setPos(item.domElem, xOff + this.stripPackSol[i][0] * this.scaleFactor,
                yOff + this.stripPackSol[i][1] * this.scaleFactor);
            this.yAgg += item.itemInfo.yLen;
        }
    }

    _moveItemToInventory(itemId) {
        let xOff = inventory.getBoundingClientRect().x - arena.getBoundingClientRect().x;
        let yOff = inventory.getBoundingClientRect().y - arena.getBoundingClientRect().y;
        let item = this.items[itemId];
        this.detach(itemId);
        setPos(item.domElem, xOff + this.stripPackSol[itemId][0] * this.scaleFactor,
            yOff + this.stripPackSol[itemId][1] * this.scaleFactor);
    }

    _createBinsAndPackItems(pos) {
        let binsNeeded = 1;
        let rawItems = this.level.items;
        for(let i=0; i < pos.length && i < rawItems.length; ++i) {
            if(pos[i] !== null && pos[i] !== undefined) {
                binsNeeded = Math.max(binsNeeded, pos[i][0] + 2);
            }
        }
        this.addBins(binsNeeded);

        // move items as per pos
        for(let i=0; i < pos.length && i < rawItems.length; ++i) {
            if(pos[i] !== null && pos[i] !== undefined) {
                let [binId, xPos, yPos] = pos[i];
                this.attach(i, binId, xPos, yPos);
            }
        }
    }

    _destroyBins() {
        for(let bin of this.bins) {
            bin.destroy();
        }
        this.bins.length = 0;
    }

    _destroyItems() {
        this.yAgg = 0;
        for(let i=0; i < this.items.length; ++i) {
            this.detach(i);
            let item = this.items[i];
            inventory.removeChild(item.domElem);
        }
        this.items.length = 0;
    }
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
        let domElemNames = ['width', 'height'];
        if(gameType === 'ks') {
            domElemNames.push('profit');
        }
        this.barDom = document.getElementById('item-info-bar');
        this.domElems = createBarItems(this.barDom, domElemNames);
    }

    activate(item) {
        let d = {'width': item.xLen, 'height': item.yLen, 'profit': item.profit};
        for(let [key, value] of Object.entries(d)) {
            let domElem = this.domElems[key];
            if(domElem !== undefined) {
                domElem.innerHTML = value;
            }
        }
        this.barDom.classList.remove('disabled');
    }

    deactivate() {
        for(let [key, domElem] of Object.entries(this.domElems)) {
            domElem.innerHTML = '';
        }
        this.barDom.classList.add('disabled');
    }

    destroy() {
        this.barDom.innerHTML = '';
        this.barDom.classList.add('disabled');
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
    let target = ev.target;
    console.debug(ev.type, ev.clientX, ev.clientY, target);
    if(ev.button === 0 && target.classList.contains('item')) {
        ev.preventDefault();
        let itemDomElem = target;
        let originalXPos = itemDomElem.getBoundingClientRect().x;
        let originalYPos = itemDomElem.getBoundingClientRect().y;
        let itemXOff = ev.clientX - originalXPos;
        let itemYOff = ev.clientY - originalYPos;
        let itemId = parseInt(itemDomElem.getAttribute('data-item-id'));
        let item = game.items[itemId];
        DragData.set(new DragData(itemId, game.getItemPosition(itemId), itemXOff, itemYOff));

        game.detach(itemId);
        let xPos = originalXPos - arena.getBoundingClientRect().x;
        let yPos = originalYPos - arena.getBoundingClientRect().y;
        setPos(item.domElem, xPos, yPos);
        hoverRect.style.height = itemDomElem.getBoundingClientRect().height + 'px';
        hoverRect.style.width = itemDomElem.getBoundingClientRect().width + 'px';
    }
}

function getPos(ev, xLen, yLen, binId) {
    let dragData = DragData.get();
    let bin = game.bins[binId];
    let binX = bin.domElem.getBoundingClientRect().x;
    let binY = bin.domElem.getBoundingClientRect().y;
    let xPos = (ev.clientX - binX - dragData.xOff) / game.scaleFactor;
    let yPos = (ev.clientY - binY - dragData.yOff) / game.scaleFactor;
    xPos = clip(Math.round(xPos), 0, bin.bin.xLen - xLen);
    yPos = clip(Math.round(yPos), 0, bin.bin.yLen - yLen);
    return [xPos, yPos];
}

function moveHoverRect(binId, rect) {
    let bin = game.bins[binId];
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

function getMouseBinId(ev) {
    for(let i=0; i < game.bins.length; ++i) {
        let bin = game.bins[i];
        if(inRect(ev.clientX, ev.clientY, bin.domElem.getBoundingClientRect())) {
            return i;
        }
    }
    return null;
}

function mousemoveHandler(ev) {
    // console.debug("mousemove", ev.target.id, ev.target.classList.value);
    ev.preventDefault();
    let dragData = DragData.get();
    if(dragData === null) {
        return;
    }

    // move item
    let item = game.items[dragData.itemId];
    let arenaX = arena.getBoundingClientRect().x;
    let arenaY = arena.getBoundingClientRect().y;
    setPos(item.domElem, ev.clientX - dragData.xOff - arenaX, ev.clientY - dragData.yOff - arenaY);

    // draw hover
    let binId = getMouseBinId(ev);
    let bin = game.bins[binId];
    if(binId === null) {
        hoverRect.style.visibility = 'hidden';
    }
    else {
        let [xPos, yPos] = getPos(ev, item.itemInfo.xLen, item.itemInfo.yLen, binId);
        let newPosRect = new Rectangle(xPos, yPos, item.itemInfo.xLen, item.itemInfo.yLen);
        moveHoverRect(binId, newPosRect);
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
    let dragData = DragData.get();
    if(dragData !== null) {
        let oldCoords = dragData.coords;
        game._recordHistory(dragData.itemId, oldCoords, game.getItemPosition(dragData.itemId));
    }
    DragData.unset();
    game.trimBins(1);
}

function mouseupHandler(ev) {
    let target = ev.target;
    console.debug(ev.type, target);
    ev.preventDefault();
    let dragData = DragData.get();
    if(dragData === null) {
        return;
    }

    let itemId = dragData.itemId;
    let itemInfo = game.items[itemId].itemInfo;
    let binId = getMouseBinId(ev);

    // attach item to bin
    if(binId !== null) {
        let [xPos, yPos] = getPos(ev, itemInfo.xLen, itemInfo.yLen, binId);
        game.attach(itemId, binId, xPos, yPos);
    }

    endDrag();
}

function mouseleaveHandler(ev) {
    let target = ev.target;
    console.debug(ev.type, target);
    ev.preventDefault();
    let dragData = DragData.get();
    if(dragData !== null) {
        endDrag();
    }
}

function keydownHandler(ev) {
    if(handleKeyPresses && !ev.defaultPrevented) {
        if(ev.key === 'z' && (ev.metaKey || ev.ctrlKey)) {
            if(game !== null) {game._undoOrRedo(!ev.shiftKey);}
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

//==[ Main ]====================================================================

window.addEventListener('load', function() {
    addEventListeners();
    loadGameFromQParams(getQParams(), null, function(msg) {addMsg('error', msg);});
    populateNgForm();
    addExtraUIEventListeners();
});
