'use strict';

//==[ Random-number generation ]================================================

// From https://stackoverflow.com/a/47593316/10294000

var seeds = [];

function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for(let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = h << 13 | h >>> 19;
    }
    return function() {
        h = Math.imul(h ^ h >>> 16, 2246822507);
        h = Math.imul(h ^ h >>> 13, 3266489909);
        return (h ^= h >>> 16) >>> 0;
    }
}

function mulberry32(a) {
    return function() {
      let t = a += 0x6D2B79F5;
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

//==[ Packing util ]============================================================

var rawSimplePackers = new Map();
var packers = new Map();

function fillEmptySlotsWithNulls(a) {
    for(let i=0; i < a.length; ++i) {
        if(a[i] === undefined) {
            a[i] = null;
        }
    }
}

function getStripDims(items, stripPackSol) {
    let xLen = 0, yLen = 0;
    for(let i=0; i < items.length; ++i) {
        xLen = Math.max(xLen, stripPackSol[items[i].id][0] + items[i].xLen);
        yLen = Math.max(yLen, stripPackSol[items[i].id][1] + items[i].yLen);
    }
    return [xLen, yLen];
}

function countUsedBins(bpSol) {
    let ind = [];
    for(let i=0; i < bpSol.length; ++i) {
        ind[bpSol[i][0]] = 1;
    }
    let nBins = 0;
    for(let j=0; j < ind.length; ++j) {
        if(ind[j] !== undefined) {
            nBins++;
        }
    }
    return nBins;
}

function rotateAllItems(items) {
    for(let i=0; i < items.length; ++i) {
        let yLen = items[i].yLen;
        items[i].yLen = items[i].xLen;
        items[i].xLen = yLen;
    }
}

function mirrorAlgo(gbpAlgo) {
    function mirrorBinPack(items, binXLen, binYLen) {
        rotateAllItems(items);
        let output = gbpAlgo(items, binYLen, binXLen);
        rotateAllItems(items);
        for(let i=0; i < output.length; ++i) {
            if(output[i] !== null) {
                let y = output[i][2];
                output[i][2] = output[i][1];
                output[i][1] = y;
            }
        }
        return output;
    }
    return mirrorBinPack;
}

function createRawMirrors(algoNames) {
    for(let algoName of algoNames) {
        rawSimplePackers.set(algoName + '-mirror', mirrorAlgo(rawSimplePackers.get(algoName)));
    }
}

function simplePackerWrap(packAlgo) {
    function simplePacker(items, binXLen, binYLen, succHook=null, failHook=null, logger=null) {
        let packing = packAlgo(items, binXLen, binYLen);
        succHook(packing);
        return null;
    }
    simplePacker.packerType = 'simple';
    return simplePacker;
}

function cookSimplePackers() {
    for(let [algoName, rawAlgo] of rawSimplePackers) {
        packers.set(algoName, simplePackerWrap(rawAlgo));
    }
}

//==[ Shelf-based packing algorithms ]==========================================

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
    if(items.length === 0) {
        return [];
    }
    let shelfId = 0;
    let shelf = new Shelf(0, xLen);
    let shelves = [shelf];
    for(let i=0; i < items.length; ++i) {
        let item = items[i];
        if(!shelf.add(item)) {
            shelf = new Shelf(++shelfId, xLen);
            shelves.push(shelf);
            shelf.add(item);
        }
    }
    return shelves;
}

function firstFitShelfPack(items, xLen) {
    if(items.length === 0) {
        return [];
    }
    let shelves = [];
    for(let i=0; i < items.length; ++i) {
        let packed = false;
        const item = items[i];
        for(let j=0; j < shelves.length; ++j) {
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
    let sortedItems = [...items].sort(RectComparator);
    return nextFitShelfPack(sortedItems, xLen);
}

function ffdhShelfPack(items, xLen) {
    let sortedItems = [...items].sort(RectComparator);
    return firstFitShelfPack(sortedItems, xLen);
}

function packShelvesIntoStrip(shelves, stripXLen) {
    let yAgg=0;
    let output = [];
    for(let i=0; i < shelves.length; ++i) {
        let items = shelves[i].items;
        let xAgg = 0;
        for(let j=0; j < items.length; ++j) {
            output[items[j].id] = [xAgg, yAgg];
            xAgg += items[j].xLen;
        }
        yAgg += shelves[i].size;
    }
    fillEmptySlotsWithNulls(output);
    return output;
}

function nfdhStripPack(items, stripXLen) {
    let shelves = nfdhShelfPack(items, stripXLen);
    return packShelvesIntoStrip(shelves, stripXLen);
}

function ffdhStripPack(items, stripXLen) {
    let shelves = ffdhShelfPack(items, stripXLen);
    return packShelvesIntoStrip(shelves, stripXLen);
}

function nextFit1D(items, binSize) {
    let used = 0;
    let binId = 0;
    let output = [];
    for(let i=0; i < items.length; ++i) {
        if(used + items[i].size <= binSize) {
            output[items[i].id] = [binId, used];
            used += items[i].size;
        }
        else {
            output[items[i].id] = [++binId, 0];
            used = items[i].size;
        }
    }
    fillEmptySlotsWithNulls(output);
    return output;
}

function firstFit1D(items, binSize) {
    let usage = [];
    let output = [];
    for(let i=0; i < items.length; ++i) {
        let itemSize = items[i].size;
        let packed = false;
        for(let j=0; j < usage.length; ++j) {
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
    fillEmptySlotsWithNulls(output);
    return output;
}

function shelfBinPack(items, shelfAlgo, bpAlgo, binXLen, binYLen) {
    let shelves = shelfAlgo(items, binXLen);
    let shelfBPOutput = bpAlgo(shelves, binYLen);
    let output = [];
    for(let i=0; i < shelves.length; ++i) {
        let items = shelves[i].items;
        let xAgg = 0;
        let [binId, y] = shelfBPOutput[i];
        for(let j=0; j < items.length; ++j) {
            output[items[j].id] = [binId, xAgg, y];
            xAgg += items[j].xLen;
        }
    }
    fillEmptySlotsWithNulls(output);
    return output;
}

function ffdhFfBinPack(items, binXLen, binYLen) {
    return shelfBinPack(items, ffdhShelfPack, firstFit1D, binXLen, binYLen);
}
rawSimplePackers.set('ffdh-ff', ffdhFfBinPack);
function nfdhBinPack(items, binXLen, binYLen) {
    return shelfBinPack(items, nfdhShelfPack, nextFit1D, binXLen, binYLen);
}
rawSimplePackers.set('nfdh', nfdhBinPack);
function ffdhNfBinPack(items, binXLen, binYLen) {
    return shelfBinPack(items, ffdhShelfPack, nextFit1D, binXLen, binYLen);
}
rawSimplePackers.set('ffdh-nf', ffdhNfBinPack);

//==[ Packing lower-bounds ]====================================================

function dff1(x, xMax) {
    // identity function
    return x / xMax;
}

function dff2(x, xMax) {
    // step at 0.5
    const x2 = x * 2;
    if(x2 === xMax) {
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

//==[ Brute-force guillotine-packing ]==========================================

var gTreeCollCache = new Map();
let MaskType = BigInt;
let maskConst0 = MaskType(0);
let maskConst1 = MaskType(1);

function setBigIntAsMaskType(yes=true) {
    if(yes) {
        MaskType = BigInt;
        maskConst0 = 0n;
        maskConst1 = 1n;
    }
    else {
        MaskType = Number;
        maskConst0 = 0;
        maskConst1 = 1;
    }
}

class GTree {
    /* A guillotine tree of d-dimensional cuboids.
     * mask: MaskType representing the set of items in the tree
     * lens: lengths of the bounding box of the packing.
     * cutDim: the dimension perpendicular to which we cut. null for leaves.
     * children: the subtrees obtained by cutting. [] for leaves.
     * itemIndex: index of the item at a leaf node. null for non-leaves.
     */
    constructor(mask, lens, cutDim, children, depth, itemIndex) {
        this.mask = mask;
        this.lens = lens;
        this.cutDim = cutDim;
        this.children = children;
        this.depth = depth;
        this.itemIndex = itemIndex;
    }
    hash() {
        return this.mask.toString(36) + ';' + this.lens.join(',');
    }
}

function listAllLE(l1, l2) {
    // returns true iff for all i, l1[i] <= l2[i]
    for(let i=0; i < l1.length && i < l2.length; ++i) {
        if(l1[i] > l2[i]) {
            return false;
        }
    }
    return true;
}

function gTreeFromItem(itemIndex, itemLens) {
    return new GTree(maskConst1 << MaskType(itemIndex), itemLens, null, [], 0, itemIndex);
}

function concatGTrees(gTrees, cutDim) {
    if(gTrees.length <= 1) {
        console.warn('concatGTrees called with only ' + gTrees.length + ' trees.');
    }
    const d = gTrees[0].lens.length;
    let newMask = maskConst0;
    let maxDepth = 0;
    let lens = new Array(d).fill(0);
    for(let gTree of gTrees) {
        newMask |= gTree.mask;
        for(let i=0; i<d; ++i) {
            if(i != cutDim) {
                lens[i] = Math.max(lens[i], gTree.lens[i]);
            }
        }
        maxDepth = Math.max(maxDepth, gTree.depth);
        lens[cutDim] += gTree.lens[cutDim];
    }
    return new GTree(newMask, lens, cutDim, gTrees, 1 + maxDepth, null);
}

function isWeakInferior(gTree1, gTree2) {
    // returns true iff gTree1 and gTree2 have the same items but
    // gTree1 takes more space than gTree2.
    if(gTree1.mask !== gTree2.mask) {
        return false;
    }
    return listAllLE(gTree2.lens, gTree1.lens);
}

function isStrongInferior(gTree1, gTree2) {
    // returns true iff gTree1 has a subset of gTree2's items but takes more space than gTree2.
    if((gTree1.mask & gTree2.mask) !== gTree1.mask) {
        return false;
    }
    return listAllLE(gTree2.lens, gTree1.lens);
}

class GTreeCollection {
    constructor(inferiority=null) {
        this.inferiority = inferiority;
        this.map = new Map();
    }

    size() {
        return this.map.size;
    }

    add(gTree) {
        let hash = gTree.hash();
        if(this.map.has(hash)) {
            return false;
        }
        if(this.inferiority !== null) {
            let keysToDelete = new Set();
            for(let [hash2, gTree2] of this.map) {
                if(this.inferiority(gTree, gTree2)) {
                    return false;
                }
                else if(this.inferiority(gTree2, gTree)) {
                    keysToDelete.add(hash2);
                }
            }
            for(const key of keysToDelete) {
                this.map.delete(key);
            }
        }
        this.map.set(hash, gTree);
        return true;
    }

    asArray() {
        return [...this.map.values()];
    }

    getTreesWithBestMask(f, minVal=0) {
        let output = [];
        let maxVal = minVal;
        for(let gTree of this.map.values()) {
            const val = f(gTree.mask);
            if(val > maxVal) {
                maxVal = val;
                output = [gTree];
            }
            else if(val === maxVal) {
                output.push(gTree);
            }
        }
        return [maxVal, output];
    }

    *genUPairs() {
        for(let [hash1, gTree1] of this.map.entries()) {
            for(let [hash2, gTree2] of this.map.entries()) {
                if(hash1 < hash2) {
                    yield [gTree1, gTree2];
                }
            }
        }
    }
}

function getInitialColl(itemLensList, binLens) {
    let gTreeColl = new GTreeCollection(isWeakInferior);
    // let gTreeColl = new GTreeCollection(isStrongInferior);
    for(let i=0; i < itemLensList.length; ++i) {
        if(listAllLE(itemLensList[i], binLens)) {
            let gTree = gTreeFromItem(i, itemLensList[i]);
            gTreeColl.add(gTree, false);
        }
    }
    return gTreeColl;
}

function improveColl(gTreeColl, binLens, cutDim) {
    let newGTrees = [];
    for(let [gTree1, gTree2] of gTreeColl.genUPairs()) {
        const intersection = gTree1.mask & gTree2.mask;
        const fits = (gTree1.lens[cutDim] + gTree2.lens[cutDim] <= binLens[cutDim]);
        if(intersection === maskConst0 && fits) {
        // if(intersection !== gTree1.mask && intersection !== gTree2.mask && fits) {
            newGTrees.push(concatGTrees([gTree1, gTree2], cutDim));
        }
    }
    let improvement = false;
    for(let gTree of newGTrees) {
        if(gTreeColl.add(gTree)) {
            improvement = true;
        }
    }
    return improvement;
}

function enumGTrees(itemLensList, binLens) {
    setBigIntAsMaskType(itemLensList.length > 30);
    let gTreeColl = getInitialColl(itemLensList, binLens);
    if(gTreeColl.size() === 0) {
        return gTreeColl;
    }
    const d = itemLensList[0].length;
    let cutDim = 0;
    let failCount = 0;
    while(failCount < d) {
        const improvement = improveColl(gTreeColl, binLens, cutDim);
        if(improvement) {failCount = 0;}
        else {failCount += 1;}
        cutDim = (cutDim + 1) % d;
    }
    return gTreeColl;
}

function enumGTreesWithCaching(itemLensList, binLens) {
    const key = JSON.stringify([itemLensList, binLens]);
    let gTreeColl = gTreeCollCache.get(key);
    if(gTreeColl === undefined) {
        gTreeColl = enumGTrees(itemLensList, binLens);
        gTreeCollCache.set(key, gTreeColl);
    }
    return gTreeColl;
}

function gTreeToPackingHelper(gTree, items, binId, position, output) {
    if(gTree.itemIndex !== null) {
        output[items[gTree.itemIndex].id] = [binId].concat(position);
    }
    else {
        let position2 = position.slice();
        for(let child of gTree.children) {
            gTreeToPackingHelper(child, items, binId, position2, output);
            position2[gTree.cutDim] += child.lens[gTree.cutDim];
        }
    }
}

function gTreeToPacking(gTree, items, binId) {
    let output = [];
    gTreeToPackingHelper(gTree, items, binId, [0, 0], output);
    fillEmptySlotsWithNulls(output);
    return output;
}

function _enumGuillKSTrees(items, binXLen, binYLen) {
    let itemLensList = [];
    let totalProfit = 0;
    for(let item of items) {
        itemLensList.push([item.xLen, item.yLen]);
        totalProfit += item.profit;
    }
    if(totalProfit <= 0) {
        return [0, []];
    }
    let gTreeColl = enumGTreesWithCaching(itemLensList, [binXLen, binYLen]);

    function maskToProfit(mask, output=0) {
        for(let i=0; mask; ++i) {
            if(mask & maskConst1) {
                output += items[i].profit;
            }
            mask >>= maskConst1;
        }
        return output;
    }
    let [maxProfit, gTrees] = gTreeColl.getTreesWithBestMask(maskToProfit);
    return [maxProfit, gTrees];
}

function enumGuillKSSols(items, binXLen, binYLen) {
    let [maxProfit, gTrees] = _enumGuillKSTrees(items, binXLen, binYLen);
    let packings = [];
    let seenMasks = new Set();
    for(let gTree of gTrees) {
        let packing = gTreeToPacking(gTree, items, 0);
        if(!seenMasks.has(gTree.mask)) {
            packings.push(packing);
            seenMasks.add(gTree.mask);
        }
    }
    return [maxProfit, packings];
}

//==[ Main ]====================================================================

createRawMirrors(['ffdh-ff', 'nfdh', 'ffdh-nf']);
cookSimplePackers();
