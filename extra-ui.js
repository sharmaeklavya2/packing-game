'use strict';

var undoButton = document.getElementById('undo-button');
var redoButton = document.getElementById('redo-button');
var ngForm = document.getElementById('ng-form');
var ngFormRawTextarea = document.getElementById('ng-raw');
var buttonToMenuMap = new Map([
    ['new-game-button', 'ng-form'],
    ['solve-button', 'solve-menu'],
    ['zoom-button', 'zoom-toolbar'],
]);

function toggleMenus(buttonId) {
    for(const [buttonId2, menuId] of buttonToMenuMap.entries()) {
        if(buttonId2 !== buttonId) {
            document.getElementById(buttonId2).classList.remove('pressed');
            document.getElementById(menuId).classList.add('disabled');
        }
        else {
            document.getElementById(buttonId).classList.toggle('pressed');
            document.getElementById(menuId).classList.toggle('disabled');
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

function ngFormCheckHandler(ev) {
    const formData = new FormData(ngForm);
    var choice = formData.get('ng-choice');
    var ngFormSubmitButton = document.getElementById('ng-submit');
    var ngFormGenParamsWrapper = document.getElementById('ng-form-gen-params-wrapper');
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
            var oldSrc = ngFormGenParamsWrapper.getAttribute('data-gen');
            if(oldSrc !== src) {
                let ngFormGenParams = document.getElementById('ng-form-gen-params');
                ngFormGenParamsWrapper.setAttribute('data-gen', src);
                ngFormGenParams.innerHTML = '';
                for(const [paramName, param] of levelGenerators.get(src).paramMap) {
                    let id = 'ng-gen-param-' + paramName;
                    let inputElem = document.createElement('input');
                    inputElem.setAttribute('type', 'text');
                    inputElem.setAttribute('id', id);
                    inputElem.setAttribute('name', paramName);
                    inputElem.setAttribute('autocomplete', 'off');
                    if(param.defaultValue !== null) {
                        inputElem.setAttribute('placeholder', param.defaultValue);
                    }
                    let labelElem = document.createElement('label');
                    labelElem.innerHTML = paramName;
                    labelElem.setAttribute('for', id);
                    let div = document.createElement('div');
                    div.appendChild(labelElem);
                    div.appendChild(inputElem);
                    div.classList.add('input-pair');
                    ngFormGenParams.appendChild(div);
                }
            }
        }
    }
}

function ngFormSubmitHandler(ev) {
    ev.preventDefault();
    ngForm.classList.add('loading');

    const formData = new FormData(ngForm);
    var choice = formData.get('ng-choice');
    let [srctype, src] = choice.split(':');
    var q = {'srctype': srctype, 'src': src};
    var qs = '';

    function failHook(msg) {addMsg('error', msg); ngFormSuccess();}
    function succHook() {
        window.history.replaceState({}, null, '?' + qs);
        ngFormSuccess();
    }

    if(srctype === 'raw') {
        let j = formData.get('ng-raw');
        let level = JSON.parse(j);
        loadGameFromRawLevel(level, null, succHook, failHook);
    }
    else if(srctype === 'upload') {
        loadGameFromUpload(null, null, failHook);
        succHook();
    }
    else if(srctype == 'url') {
        qs = toQueryString(q);
        loadGameFromUrl(src, null, succHook, failHook);
    }
    else if(srctype == 'gen') {
        for(let [key, value] of formData.entries()) {
            if(!(key.startsWith('ng-')) && value !== '') {
                q[key] = value;
            }
        }
        qs = toQueryString(q);
        loadGameFromGen(src, q, null, succHook, failHook);
    }
}

function solveSuccess() {
    document.getElementById('solve-menu').classList.add('disabled');
    document.getElementById('solve-button').classList.remove('pressed');
}

function solveClickHandler(ev) {
    ev.preventDefault();
    var algoName = ev.target.innerHTML;
    game.selectSolution(algoName);
    solveSuccess();
}

function repopulateSolveMenu() {
    var solutions = game.level.solutions;
    var keys = new Set();
    for(let key of Object.keys(solutions)) {
        if(solutions.hasOwnProperty(key)) {
            keys.add(key);
        }
    }
    for(let key of Object.keys(bpAlgos)) {
        if(bpAlgos.hasOwnProperty(key)) {
            keys.add(key);
        }
    }

    var solveList = document.getElementById('solve-list');
    solveList.innerHTML = '';
    for(let key of keys) {
        var liElem = document.createElement('li');
        liElem.innerHTML = key;
        liElem.addEventListener('click', solveClickHandler);
        solveList.appendChild(liElem);
    }
}

function populateNgForm() {
    var levels = [
        ['levels/bp/1.json', 'Level 1'],
        ['levels/bp/2.json', 'Level 2'],
        ['levels/bp/3.json', 'Level 3'],
    ];
    for(var i=0; i < levels.length; ++i) {
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
    document.getElementById('zoom-button').addEventListener('click', function(ev) {
            toggleMenus('zoom-button');
        });
    document.getElementById('save-game-button').addEventListener('click', function(ev) {
            if(game !== null) {downloadProgress();}
        });
    document.getElementById('unpack-button').addEventListener('click', function(ev) {
            game.putBack();
        });
    document.getElementById('solve-button').addEventListener('click', function(ev) {
            toggleMenus('solve-button');
        });
    document.getElementById('about-button').addEventListener('click', function(ev) {
            window.alert(aboutText);
        });

    ngForm.addEventListener('submit', ngFormSubmitHandler);
    ngForm.addEventListener('change', ngFormCheckHandler);
    ngForm.addEventListener('input', ngFormCheckHandler);

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
    var closeBtn = ev.target;
    var LiElem = closeBtn.parentElement;
    var msgList = document.getElementById('msg-list');
    msgList.removeChild(LiElem);
}

function addMsg(type, text) {
    var liElem = document.createElement('li');
    liElem.classList.add(type);
    var msgSpan = document.createElement('span');
    msgSpan.classList.add('msg-text');
    msgSpan.innerHTML = text;
    liElem.appendChild(msgSpan);
    var closeButton = document.createElement('span');
    closeButton.classList.add('msg-close-btn');
    closeButton.innerHTML = '&times;';
    closeButton.addEventListener('click', closeBtnClickHandler);
    liElem.appendChild(closeButton);
    var msgList = document.getElementById('msg-list');
    msgList.appendChild(liElem);
}
