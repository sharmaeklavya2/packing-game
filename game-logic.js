class Rectangle {
    constructor(xPos, yPos, xLen, yLen) {
        this.xPos = xPos;
        this.yPos = yPos;
        this.xLen = xLen;
        this.yLen = yLen;
    }
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

    reset() {
        this.count = 0;
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

function array2d(m, n, x) {
/* create m-length list containing n-length lists of element x */
    let arr = [];
    for(let i=0; i<m; ++i) {
        arr.push(new Array(n).fill(x));
    }
    return arr;
}

class Bin {
    constructor(xLen, yLen) {
        this.xLen = xLen;
        this.yLen = yLen;
        this._aggFilled = array2d(yLen+1, xLen+1, 0);
    }

    isEmpty() {
        return this._getAggFilled(this.xLen, this.yLen) == 0;
    }

    canFit(rect) {
        if((rect.xPos + rect.xLen > this.xLen) || (rect.yPos + rect.yLen > this.yLen)) {
            return false;
        }
        return this._getFilledArea(rect) == 0;
    }

    reset() {
        for(let i=0; i <= this.xLen; ++i) {
            for(let j=0; j <= this.yLen; ++j) {
                this._aggFilled[i][j] = 0;
            }
        }
    }

    insert(rect) {
        if(this.canFit(rect)) {
            // this.rects.push(rect);
            this._fill(rect, 1);
            return true;
        }
        return false;
    }

    remove(rect) {
        this._fill(rect, -1);
        return true;
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

    _getFilledArea(rect) {
        const minX = Math.min(rect.xPos + rect.xLen, this.xLen);
        const minY = Math.min(rect.yPos + rect.yLen, this.yLen);
        return this._getAggFilled(minX, minY)
            - this._getAggFilled(rect.xPos, minY)
            - this._getAggFilled(minX, rect.yPos)
            + this._getAggFilled(rect.xPos, rect.yPos);
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

function safeCall(f, ...args) {
    if(f !== undefined && f !== null) {
        return f(...args);
    }
}

class Packing {
    constructor(items, hooks) {
        this.items = items;
        this.itemToBin = new Array(items.length).fill(null);
        this.itemXPos = new Array(items.length).fill(null);
        this.itemYPos = new Array(items.length).fill(null);
        this.bins = [];
        this.hooks = hooks;
    }

    addBin(xLen, yLen) {
        this.bins.push(new Bin(xLen, yLen));
    }

    popBin() {
        if(this.bins[this.bins.length-1].isEmpty()) {
            this.bins.length--;
        }
        else {
            throw new Error('attempt to pop non-empty bin.');
        }
    }

    _assertNBins(binId) {
        if(binId >= this.bins.length) {
            throw new Error('bin ' + binId + ' does not exist.');
        }
    }

    isBinEmpty(binId) {
        this._assertNBins(binId);
        return this.bins[binId].isEmpty();
    }

    attach(itemId, binId, xPos, yPos) {
        this._assertNBins(binId);
        if(this.itemToBin[itemId] !== null) {
            throw new Error('item ' + itemId + ' is already attached to '
                + this.itemToBin[itemId] + '.');
            }
        }
        const wasEmpty = this.bins[binId].isEmpty();
        const item = this.items[itemId];
        let attachSucc = this.bins[binId].insert(new Rectangle(xPos, yPos, item.xLen, item.yLen));
        if(attachSucc) {
            this.itemToBin[itemId] = binId;
            this.itemXPos[itemId] = xPos;
            this.itemYPos[itemId] = yPos;
            if(wasEmpty) {
                safeCall(this.hooks['binNoLongerEmpty'], binId);
            }
        }
        safeCall(this.hooks['attach'], attachSucc, itemId, binId, xPos, yPos, wasEmpty);
        return [attachSucc, wasEmpty];
    }

    detach(itemId) {
        const binId = this.itemToBin[itemId];
        if(binId !== null) {
            const item = this.items[itemId];
            const [xPos, yPos] = [this.itemXPos[itemId], this.itemYPos[itemId]];
            this.bins[binId].remove(new Rectangle(xPos, yPos, item.xLen, item.yLen));
            this.itemToBin[itemId] = null;
            this.itemXPos[itemId] = null;
            this.itemYPos[itemId] = null;
            safeCall(this.hooks['detach'], itemId, binId);
            if(this.bins[binId].isEmpty()) {
                safeCall(this.hooks['binNowEmpty'], binId);
            }
        }
        else {
            safeCall(this.hooks['alreadyDetached'], itemId, binId);
        }
    }

    canFit(itemId, binId, xPos, yPos) {
        this._assertNBins(binId);
        const item = this.items[itemId];
        return this.bins[binId].canFit(new Rectangle(xPos, yPos, item.xLen, item.yLen));
    }

    getItemPosition(itemId) {
        if(this.itemToBin[itemId] !== null) {
           return [this.itemToBin[itemId], this.itemXPos[itemId], this.itemYPos[itemId]];
        }
        else {
            return null;
        }
    }

    getItemPositions() {
        let pos = [];
        let consecNulls = 0;
        let n = this.items.length;
        for(let i=0; i<n; ++i) {
            let coords = this.getItemPosition(itemId);
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

    destroy() {
        this.items = null;
        this.bins = null;
        this.itemToBin = null;
        this.itemXPos = null;
        this.itemYPos = null;
    }

    detachAll() {
        for(let j=0; j < this.bins.length; ++j) {
            this.bins[j].reset();
        }
        for(let i=0; i < this.items.length; ++i) {
            this.itemToBin[i] = null;
            this.itemXPos[i] = null;
            this.itemYPos[i] = null;
        }
    }

    bulkAttach(pos) {
        let maxBinId = -1;
        for(let i=0; i < pos.length && i < this.items.length; ++i) {
            if(pos[i] !== null && pos[i] !== undefined) {
                maxBinId = Math.max(maxBinId, pos[i][0]);
            }
        }
        this._assertNBins(maxBinId);
        this.detachAll();

        for(let i=0; i < pos.length && i < this.items.length; ++i) {
            if(pos[i] !== null && pos[i] !== undefined) {
                let [binId, xPos, yPos] = pos[i];
                const item = this.items[i];
                let attachSucc = this.bins[binId].insert(
                    new Rectangle(xPos, yPos, item.xLen, item.yLen));
                if(attachSucc) {
                    this.itemToBin[itemId] = binId;
                    this.itemXPos[itemId] = xPos;
                    this.itemYPos[itemId] = yPos;
                }
            }
        }
    }
}
