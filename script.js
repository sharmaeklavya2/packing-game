'use strict';

// Logic Layer =================================================================

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

class FixedInput {
    constructor(items) {
        this.items = [
            new ItemInfo(2, 1, 1, 'green'),
            new ItemInfo(1, 2, 1, 'blue'),
            new ItemInfo(2, 2, 1, 'yellow'),
            new ItemInfo(3, 2, 1, 'red'),
            ];
        this.binXLen = 4;
        this.binYLen = 3;
        this.nBin = 2;  // null for bin-packing
    }

    isKnapsack() {
        return this.nBin !== null;
    }
}

// UI Layer ====================================================================

var arenaWrapper = document.getElementById('arena-wrapper');
var arena = document.getElementById('arena');
var inventory = document.getElementById('inventory');
var packingArea = document.getElementById('packing-area');
var hoverRect = document.getElementById('hover-rect');
var uiMargin = 10;  // margin between arena and the elements inside it, in px.
var defaultItemColor = 'blue';

function setPos(domElem, xPos, yPos) {
    domElem.style.top = yPos + 'px';
    domElem.style.left = xPos + 'px';
}

class ItemUI {
    constructor(itemInfo, id, scaleFactor) {
        this.itemInfo = itemInfo;
        this.rect = new Rectangle(null, null, itemInfo.xLen, itemInfo.yLen);
        this.id = id;
        this.binUI = null;
        this.scaleFactor = scaleFactor;

        // DOM
        var elem = document.createElement('div');
        elem.classList.add('item');
        elem.setAttribute('data-item-id', this.id);
        elem.style.width = this.scaleFactor * this.rect.xLen + 'px';
        elem.style.height = this.scaleFactor * this.rect.yLen + 'px';
        if(itemInfo.color !== null) {
            elem.style.backgroundColor = itemInfo.color;
        }
        else {
            elem.style.backgroundColor = defaultItemColor;
        }
        this.domElem = elem;
    }

    detach() {
        if(this.binUI !== null) {
            this.binUI.bin.remove(this.rect);
            this.binUI.domElem.removeChild(this.domElem);
            this.domElem.classList.remove('packed');
            this.binUI = null;
            inventory.appendChild(this.domElem);
        }
    }

    attach(binUI, xPos, yPos) {
        console.assert(this.binUI === null, 'item infidelity');
        if(binUI.bin.insert(new Rectangle(xPos, yPos, this.rect.xLen, this.rect.yLen))) {
            this.binUI = binUI;
            this.rect.xPos = xPos;
            this.rect.yPos = yPos;
            this.domElem.classList.add('packed');
            setPos(this.domElem, this.scaleFactor * xPos, this.scaleFactor * yPos);
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

class Game {

    addBins(nBin) {
        for(var i=0; i<nBin; ++i) {
            var bin = new BinUI(this.input.binXLen, this.input.binYLen, false,
                this.bins.length + i, this.scaleFactor);
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

    constructor(input, scaleFactor) {
        this.input = input;

        // get inventory's dimensions
        var totalYLen = 0;
        var maxXLen = 0;
        var inputItems = this.input.items;
        for(var item of inputItems) {
            totalYLen += item.yLen;
            maxXLen = Math.max(maxXLen, item.xLen);
        }
        var invXLen = maxXLen, invYLen = totalYLen;

        if(scaleFactor === null) {
            // infer scaleFactor from arenaWrapper's dims
            var arenaX = arenaWrapper.getBoundingClientRect().width;
            var arenaY = arenaWrapper.getBoundingClientRect().height;
            console.log("arena:", arenaX, arenaY);
            var scaleX = (arenaX - 3 * uiMargin) / (invXLen + this.input.binXLen);
            var scaleY = (arenaY - 3 * uiMargin) / Math.max(invYLen, this.input.binYLen);
            console.log("inferred scale:", scaleX, scaleY);
            this.scaleFactor = Math.min(scaleX, scaleY);
        }
        else {
            this.scaleFactor = scaleFactor;
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
        this.moveItemsToInventory(true);

        // create bins
        this.bins = [];
        if(this.input.isKnapsack()) {
            this.addBins(this.input.nBin);
        }
        else {
            this.addBins(1);
        }
    }

    moveItemsToInventory(firstTime) {
        var xOff = inventory.getBoundingClientRect().x - arena.getBoundingClientRect().x;
        var yOff = inventory.getBoundingClientRect().y - arena.getBoundingClientRect().y;
        this.yAgg = 0;
        for(var item of this.items) {
            item.detach();
            if(firstTime) {
                inventory.appendChild(item.domElem);
            }
            setPos(item.domElem, xOff, yOff + this.yAgg * this.scaleFactor);
            this.yAgg += item.rect.yLen;
        }
    }

    _destroyBins() {
        for(var bin of this.bins) {
            bin.destroy();
        }
        this.bins.length = 0;
    }

    reset() {
        this.moveItemsToInventory(false);
        if(!this.input.isKnapsack()) {
            this._destroyBins();
            this.addBins(1);
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
        inventory.style.backgroundSize = null;
    }
}

var input = new FixedInput();
var game = new Game(input, null);

// Event Handlers ==============================================================

var globalDragData = null;

class DragData {
    constructor(itemId, xOff, yOff) {
        this.itemId = itemId;
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
        // ev.dataTransfer.setData('text/html', null);
    }
    static unset() {
        globalDragData = null;
    }
}

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
        var item = game.items[itemId];
        DragData.set(new DragData(itemId, itemXOff, itemYOff));

        item.detach();
        var xPos = originalXPos - arena.getBoundingClientRect().x;
        var yPos = originalYPos - arena.getBoundingClientRect().y;
        setPos(item.domElem, xPos, yPos);
        hoverRect.style.height = itemDomElem.getBoundingClientRect().height + 'px';
        hoverRect.style.width = itemDomElem.getBoundingClientRect().width + 'px';
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

function getPos(ev, bin, binDomElem) {
    var dragData = DragData.get();
    var binX = binDomElem.getBoundingClientRect().x;
    var binY = binDomElem.getBoundingClientRect().y;
    var xPos = (ev.clientX - binX - dragData.xOff) / bin.scaleFactor;
    var yPos = (ev.clientY - binY - dragData.yOff) / bin.scaleFactor;
    xPos = clip(Math.round(xPos), 0, bin.bin.xLen-1);
    yPos = clip(Math.round(yPos), 0, bin.bin.yLen-1);
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
        var binDomElem = bin.domElem;
        let [xPos, yPos] = getPos(ev, bin, binDomElem);
        var newPosRect = new Rectangle(xPos, yPos, item.rect.xLen, item.rect.yLen);
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
    DragData.unset();
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
        let [xPos, yPos] = getPos(ev, bin, bin.domElem);
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
}

addEventListeners();
