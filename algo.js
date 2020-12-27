'use strict';

function nextFitStrip(items, stripXLen) {
    if(items.length == 0) {
        return [0, []];
    }
    var sol = [[0, 0]];
    var maxY = items[0].yLen;
    var xSum = items[0].xLen, ySum = 0;
    for(var i=1; i<items.length; ++i) {
        var item = items[i];
        if(item.xLen <= stripXLen - xSum) {
            sol.push([xSum, ySum]);
            xSum += item.xLen;
            maxY = Math.max(maxY, item.yLen);
        }
        else {
            ySum += maxY;
            sol.push([0, ySum]);
            maxY = item.yLen;
            xSum = item.xLen;
        }
    }
    ySum += maxY;
    return [ySum, sol];
}

function keyFuncToCompareFunc(keyFunc) {
    return function(x, y) {
        let xKey = keyFunc(x), yKey = keyFunc(y);
        if(xKey < yKey) {
            return -1;
        }
        else if(xKey > yKey) {
            return 1;
        }
        else {
            return 0;
        }
    };
}

function sortMaps(a, compareFunc) {
// returns (pi, piinv, sorted(a)) such that a[pi] = sorted(a)
    var b = [], n = a.length;
    for(var i=0; i<n; ++i) {
        b.push([i, a[i]]);
    }
    b.sort(function(x, y) {
        return compareFunc(x[1], y[1]);
    });
    var pi = [], sortedA = [], piinv = Array(n);
    for(var i=0; i<n; ++i) {
        pi.push(b[i][0]);
        sortedA.push(b[i][1]);
        piinv[b[i][0]] = i;
    }
    b.length = 0;
    return [pi, piinv, sortedA];
}

function applyIndexMap(a, pi) {
    var b = [], n = a.length;
    for(var i=0; i<n; ++i) {
        b.push(a[pi[i]]);
    }
    return b;
}

function nfdhStrip(items, stripXLen) {
    var compareFunc = keyFuncToCompareFunc(function(x) {return -x.yLen;});
    let [pi, piinv, itemsSorted] = sortMaps(items, compareFunc);
    let [ySum, solSorted] = nextFitStrip(itemsSorted, stripXLen);
    var sol = applyIndexMap(solSorted, piinv);
    return [ySum, sol];
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
