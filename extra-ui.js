'use strict';

var undoButton = document.getElementById('undo-button');
var redoButton = document.getElementById('redo-button');
var ngForm = document.getElementById('ng-form');
var editForm = document.getElementById('edit-form');
var ngFormRawTextarea = document.getElementById('ng-raw');
var buttonToMenuMap = new Map([
    ['new-game-button', 'ng-form'],
    ['solutions-button', 'solutions-menu'],
    ['auto-pack-button', 'auto-pack-menu'],
    ['export-button', 'export-menu'],
    ['zoom-button', 'zoom-toolbar'],
    ['edit-button', 'edit-form'],
]);

function toggleMenus(buttonId) {
    for(const [buttonId2, menuId] of buttonToMenuMap.entries()) {
        if(buttonId2 !== buttonId) {
            document.getElementById(buttonId2).classList.remove('pressed');
            if(menuId !== null) {
                document.getElementById(menuId).classList.add('disabled');
            }
        }
        else {
            document.getElementById(buttonId).classList.toggle('pressed');
            if(menuId !== null) {
                document.getElementById(menuId).classList.toggle('disabled');
            }
        }
    }
}

var aboutText = "This is a 2D geometric bin-packing game. You have to pack all items from "
    + "the left side into the minimum number of bins on the right side.";

function getPersistentHeaderHeight() {
    return document.getElementById('main-toolbar').getBoundingClientRect().height;
}

function ngFormSuccess() {
    ngForm.classList.add('disabled');
    ngForm.classList.remove('loading');
    document.getElementById('new-game-button').classList.remove('pressed');
}

function createGenParamsInputs(src) {
    let ngFormGenParams = document.getElementById('ng-form-gen-params');
    ngFormGenParams.innerHTML = '';
    for(const [paramName, param] of levelGenerators.get(src).paramMap) {
        let div = document.createElement('div');
        div.classList.add('input-pair');
        let id = 'ng-gen-param-' + paramName;
        let labelElem = document.createElement('label');
        labelElem.innerHTML = paramName;
        labelElem.setAttribute('for', id);
        div.appendChild(labelElem);

        let inputElem = document.createElement('input');
        inputElem.setAttribute('type', 'text');
        inputElem.setAttribute('id', id);
        inputElem.setAttribute('name', paramName);
        inputElem.setAttribute('autocomplete', 'off');
        if(param.defaultValue !== null) {
            inputElem.setAttribute('placeholder', param.defaultValue);
        }
        div.appendChild(inputElem);

        if(param.options !== null) {
            let datalist = document.createElement('datalist');
            const listId = 'ng-gen-paramoptions-' + paramName;
            datalist.setAttribute('id', listId);
            for(const optionName of param.options) {
                let option = document.createElement('option');
                option.setAttribute('value', optionName);
                datalist.appendChild(option);
            }
            inputElem.setAttribute('list', listId);
            div.appendChild(datalist);
        }

        ngFormGenParams.appendChild(div);
    }
}

function ngFormCheckHandler(ev) {
    const formData = new FormData(ngForm);
    let choice = formData.get('ng-choice');
    let ngFormSubmitButton = document.getElementById('ng-submit');
    let ngFormGenParamsWrapper = document.getElementById('ng-form-gen-params-wrapper');
    if(choice === null) {
        ngFormSubmitButton.setAttribute('disabled', 'disabled');
        ngFormGenParamsWrapper.classList.add('disabled');
    }
    else {
        ngFormSubmitButton.removeAttribute('disabled');
        let [srctype, src] = choice.split(':');
        if(srctype === 'raw') {
            ngFormRawTextarea.setAttribute('required', 'required');
            let disAttr = ngFormRawTextarea.getAttribute('disabled');
            if(disAttr !== null) {
                ngFormRawTextarea.removeAttribute('disabled');
                ngFormRawTextarea.setAttribute('rows', 6);
                ngFormRawTextarea.setAttribute('cols', 80);
                ngFormRawTextarea.focus();
            }
        }
        else {
            ngFormRawTextarea.removeAttribute('required');
        }
        if(srctype !== 'gen') {
            ngFormGenParamsWrapper.classList.add('disabled');
        }
        else {
            ngFormGenParamsWrapper.classList.remove('disabled');
            let oldSrc = ngFormGenParamsWrapper.getAttribute('data-gen');
            if(oldSrc !== src) {
                ngFormGenParamsWrapper.setAttribute('data-gen', src);
                createGenParamsInputs(src);
            }
        }
    }
}

function editFormCheckHandler(ev) {
    const formData = new FormData(editForm);
    const keys = ['item', 'bin'];
    for(const key of keys) {
        setMouseMode(key, formData.get('edit-' + key));
    }
}

function toQueryString(obj) {
    let strs = [];
    for(let [key, value] of Object.entries(obj)) {
        strs.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
    }
    return strs.join("&");
}

function ngFormSubmitHandler(ev) {
    ev.preventDefault();
    ngForm.classList.add('loading');

    const formData = new FormData(ngForm);
    let choice = formData.get('ng-choice');
    let [srctype, src] = choice.split(':');
    let q = {'srctype': srctype, 'src': src};
    let qs = '';

    function failHook(msg) {addMsg('error', msg); ngFormSuccess();}
    function succHook() {
        window.history.replaceState({}, null, '?' + qs);
        ngFormSuccess();
    }

    if(srctype === 'raw') {
        let j = formData.get('ng-raw');
        loadGameFromJsonString(j, null, succHook, failHook);
    }
    else if(srctype === 'upload') {
        loadGameFromUpload(null, null, failHook);
        succHook();
    }
    else if(srctype === 'url') {
        qs = toQueryString(q);
        loadGameFromUrl(src, null, succHook, failHook);
    }
    else if(srctype === 'gen') {
        for(let [key, value] of formData.entries()) {
            if(!(key.startsWith('ng-')) && value !== '') {
                q[key] = value;
            }
        }
        qs = toQueryString(q);
        loadGameFromGen(src, q, null, succHook, failHook);
    }
}

function showSolutionSuccess() {
    document.getElementById('solutions-menu').classList.add('disabled');
    document.getElementById('solutions-button').classList.remove('pressed');
}

function autoPackComplete() {
    document.getElementById('auto-pack-menu').classList.add('disabled');
    document.getElementById('auto-pack-button').classList.remove('pressed');
}

function solutionsClickHandler(ev) {
    ev.preventDefault();
    let solnName = ev.target.innerHTML;
    game.selectSolution(solnName);
    showSolutionSuccess();
}

function autoPackClickHandler(ev) {
    ev.preventDefault();
    let algoName = ev.target.innerHTML;
    game.selectAutoPack(algoName, null, autoPackComplete, autoPackComplete, null);
}

function repopulateSolutionsMenu(solutions) {
    let listDomElem = document.getElementById('solutions-list');
    listDomElem.innerHTML = '';
    let button = document.getElementById('solutions-button');
    if(solutions.size === 0) {
        button.classList.add('disabled');
    }
    else {
        button.classList.remove('disabled');
    }
    for(let key of solutions.keys()) {
        let liElem = document.createElement('li');
        liElem.innerHTML = key;
        liElem.addEventListener('click', solutionsClickHandler);
        listDomElem.appendChild(liElem);
    }
}

function repopulateAutoPackMenu() {
    let listDomElem = document.getElementById('auto-pack-list');
    listDomElem.innerHTML = '';
    let button = document.getElementById('auto-pack-button');
    if(packers.size === 0) {
        button.classList.add('disabled');
    }
    else {
        button.classList.remove('disabled');
    }
    for(let key of packers.keys()) {
        let liElem = document.createElement('li');
        liElem.innerHTML = key;
        liElem.addEventListener('click', autoPackClickHandler);
        listDomElem.appendChild(liElem);
    }
}

function populateNgForm() {
    let levels = [
        ['levels/bp/1.json', 'Level 1'],
        ['levels/bp/2.json', 'Level 2'],
        ['levels/bp/3.json', 'Level 3'],
        ['levels/bp/4.json', 'Level 4'],
    ];
    for(let i=0; i < levels.length; ++i) {
        let [url, label] = levels[i];
        let id = 'ng-radio-url-' + i;
        let inputElem = document.createElement('input');
        inputElem.setAttribute('type', 'radio');
        inputElem.setAttribute('id', id);
        inputElem.setAttribute('name', 'ng-choice');
        inputElem.setAttribute('value', 'url:' + url);
        let labelElem = document.createElement('label');
        labelElem.innerHTML = label;
        labelElem.setAttribute('for', id);
        let div = document.createElement('div');
        div.appendChild(inputElem);
        div.appendChild(labelElem);
        div.classList.add('input-pair');
        document.getElementById('ng-form-levels').appendChild(div);
    }
    for(const [genName, gen] of levelGenerators) {
        let id = 'ng-radio-gen-' + genName;
        let inputElem = document.createElement('input');
        inputElem.setAttribute('type', 'radio');
        inputElem.setAttribute('id', id);
        inputElem.setAttribute('name', 'ng-choice');
        inputElem.setAttribute('value', 'gen:' + genName);
        let labelElem = document.createElement('label');
        labelElem.innerHTML = genName;
        labelElem.setAttribute('for', id);
        let div = document.createElement('div');
        div.appendChild(inputElem);
        div.appendChild(labelElem);
        div.classList.add('input-pair');
        document.getElementById('ng-form-gens').appendChild(div);
    }
}

function addExtraUIEventListeners() {
    document.getElementById('new-game-button').addEventListener('click', function(ev) {
            toggleMenus('new-game-button');
            ngForm.classList.remove('loading');
        });
    undoButton.addEventListener('click', function(ev) {
            if(game !== null) {game.undo();}
        });
    redoButton.addEventListener('click', function(ev) {
            if(game !== null) {game.redo();}
        });
    document.getElementById('save-game-button').addEventListener('click', function(ev) {
            if(game !== null) {downloadProgress();}
        });
    document.getElementById('unpack-button').addEventListener('click', function(ev) {
            let oldPos = game.getItemPositions();
            game.putBack();
            game._recordHistoryCommand({'cmd': 'bulkMove', 'oldPos': oldPos, 'newPos': []});
        });
    let solutionsButton = document.getElementById('solutions-button');
    solutionsButton.addEventListener('click', function(ev) {
            if(!solutionsButton.classList.contains('disabled') && game !== null) {
                if(game.level.solutions.size === 1) {
                    for(const key of game.level.solutions.keys()) {
                        game.selectSolution(key);
                    }
                }
                else {
                    toggleMenus('solutions-button');
                }
            }
        });
    document.getElementById('about-button').addEventListener('click', function(ev) {
            window.alert(aboutText);
        });
    let onlyToggleIds = ['zoom-button', 'auto-pack-button', 'export-button', 'edit-button'];
    for(const id of onlyToggleIds) {
        document.getElementById(id).addEventListener('click', function(ev) {
                toggleMenus(id);
            });
    }

    ngForm.addEventListener('submit', ngFormSubmitHandler);
    ngForm.addEventListener('change', ngFormCheckHandler);
    ngForm.addEventListener('input', ngFormCheckHandler);
    editForm.addEventListener('change', editFormCheckHandler);
    editForm.addEventListener('input', editFormCheckHandler);

    ngFormRawTextarea.addEventListener('focus', function() {
            handleKeyPresses = false;
            document.getElementById('ng-radio-raw').click();
        });
    ngFormRawTextarea.addEventListener('blur', function() {
            handleKeyPresses = true;
        });

    document.getElementById('zoom-in-button').addEventListener('click', function(ev) {
            game.resize(game.scaleFactor * 1.1);
        });
    document.getElementById('zoom-out-button').addEventListener('click', function(ev) {
            game.resize(game.scaleFactor / 1.1);
        });
    document.getElementById('zoom-x-button').addEventListener('click', function(ev) {
            game.resize('x');
        });
    document.getElementById('zoom-y-button').addEventListener('click', function(ev) {
            game.resize('y');
        });
    document.getElementById('zoom-fit-button').addEventListener('click', function(ev) {
            game.resize(null);
        });

    document.getElementById('export-li-tikz').addEventListener('click', function(ev) {
            if(game.nBinsUsed === 0) {
                addMsg('error', 'No bins have been used; nothing to export.');
            }
            downloadBinsToTikz();
            document.getElementById('export-button').classList.remove('pressed');
            document.getElementById('export-menu').classList.add('disabled');
        });
    document.getElementById('export-li-svg').addEventListener('click', function(ev) {
            downloadAsSvg();
            document.getElementById('export-button').classList.remove('pressed');
            document.getElementById('export-menu').classList.add('disabled');
        });
    document.getElementById('export-li-pdf').addEventListener('click', function(ev) {
            if(game.nBinsUsed === 0) {
                addMsg('error', 'No bins have been used; nothing to export.');
            }
            else {
                document.body.classList.add('show-bins-only');
                window.print();
                setTimeout(function() {document.body.classList.remove('show-bins-only');}, 0);
            }
            document.getElementById('export-button').classList.remove('pressed');
            document.getElementById('export-menu').classList.add('disabled');
        });
}

function disableUndoButton() {
    undoButton.classList.add('disabled');
}
function enableUndoButton() {
    undoButton.classList.remove('disabled');
}
function disableRedoButton() {
    redoButton.classList.add('disabled');
}
function enableRedoButton() {
    redoButton.classList.remove('disabled');
}

function closeBtnClickHandler(ev) {
    let closeBtn = ev.target;
    let LiElem = closeBtn.parentElement;
    let msgList = document.getElementById('msg-list');
    msgList.removeChild(LiElem);
}

function addMsg(type, text) {
    let textArray;
    if(Array.isArray(text)) {
        textArray = text;
    }
    else {
        textArray = [text];
    }
    for(const text of textArray) {
        let liElem = document.createElement('li');
        liElem.classList.add(type);
        let msgSpan = document.createElement('span');
        msgSpan.classList.add('msg-text');
        msgSpan.innerHTML = text;
        liElem.appendChild(msgSpan);
        let closeButton = document.createElement('span');
        closeButton.classList.add('msg-close-btn');
        closeButton.innerHTML = '&times;';
        closeButton.addEventListener('click', closeBtnClickHandler);
        liElem.appendChild(closeButton);
        let msgList = document.getElementById('msg-list');
        msgList.appendChild(liElem);
    }
}

function showCelebration() {
    let canvas = document.getElementById('celebrate-canvas');
    if(!canvas.getContext) {return;}
    const width = window.innerWidth, height = window.innerHeight;
    const minDim = Math.min(width, height);
    canvas.width = width;
    canvas.height = height;
    let ctx = canvas.getContext('2d');
    const canvasNewX = Math.floor(width / 2), canvasNewY = Math.floor(height / 3);
    ctx.translate(canvasNewX, canvasNewY);

    const n = 50;
    let ux = [], uy = [], hues = [];
    for(let i=0; i<n; ++i) {
        ux[i] = 2 * Math.random() - 1;
        uy[i] = 2 * Math.random() - 1;
        hues[i] = 360 * Math.random();
    }

    function terminateAnimation() {
        ctx.translate(-canvasNewX, -canvasNewY);
        canvas.width = 0;
        canvas.height = 0;
    }

    let startTime = null;
    function draw(timeStamp) {
        if(startTime === null) {
            startTime = timeStamp;
        }
        const t = (timeStamp - startTime) / 1000;
        const g = 5, vScale = 2;
        ctx.clearRect(-canvasNewX, -canvasNewY, width, height);
        for(let i=0; i<n; ++i) {
            const x = ux[i]*vScale*t, y = uy[i]*vScale*t + g*t*t / 2;
            const alpha = Math.max(0, 1 - t/2);
            ctx.fillStyle = `hsla(${hues[i]}, 100%, 50%, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x*minDim, y*minDim, 8, 0, 2 * Math.PI, true);
            ctx.closePath();
            ctx.fill();
        }
        if(t < 2) {
            window.requestAnimationFrame(draw);
        }
        else {
            terminateAnimation();
        }
    }
    window.requestAnimationFrame(draw);
}
