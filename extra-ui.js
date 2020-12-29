'use strict';

var undoButton = document.getElementById('undo-button');
var ngForm = document.getElementById('ng-form');
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
    var ngFormGenParams = document.getElementById('ng-form-gen-params');
    var ngFormGenParamsWrapper = document.getElementById('ng-form-gen-params-wrapper');
    if(choice === null) {
        ngFormSubmitButton.setAttribute('disabled', 'disabled');
        ngFormGenParamsWrapper.classList.add('disabled');
    }
    else {
        ngFormSubmitButton.removeAttribute('disabled');
        let [srctype, src] = choice.split(':');
        if(srctype !== 'gen') {
            ngFormGenParamsWrapper.classList.add('disabled');
        }
        else {
            ngFormGenParamsWrapper.classList.remove('disabled');
            var oldSrc = ngFormGenParamsWrapper.getAttribute('data-gen');
            if(oldSrc !== src) {
                ngFormGenParamsWrapper.setAttribute('data-gen', src);
                ngFormGenParams.innerHTML = '';
                for(const [paramName, param] of levelGenerators.get(src).paramMap) {
                    let id = 'ng-gen-param-' + paramName;
                    let inputElem = document.createElement('input');
                    inputElem.setAttribute('type', 'text');
                    inputElem.setAttribute('id', id);
                    inputElem.setAttribute('name', paramName);
                    inputElem.setAttribute('autocomplete', 'off');
                    inputElem.setAttribute('value', param.defaultValue);
                    inputElem.setAttribute('placeholder', param.defaultValue);
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
    const formData = new FormData(ngForm);
    var choice = formData.get('ng-choice');
    let [srctype, src] = choice.split(':');
    ngForm.classList.add('loading');
    function failHook(msg) {addMsg('error', msg); ngFormSuccess();}
    if(srctype == 'upload') {
        loadGameFromUpload(null, null, failHook);
        ngFormSuccess();
        window.history.replaceState({}, null, '?');
    }
    else if(srctype == 'url') {
        loadGameFromUrl(src, null, ngFormSuccess, failHook);
        var qs = toQueryString({'srctype': srctype, 'src': src});
        window.history.replaceState({}, null, '?' + qs);
    }
    else if(srctype == 'gen') {
        var q = {'srctype': srctype, 'src': src};
        for(let [key, value] of formData.entries()) {
            if(key !== 'ng-choice') {
                q[key] = value;
            }
        }
        loadGameFromGen(src, q, null, ngFormSuccess, failHook);
        var qs = toQueryString(q);
        window.history.replaceState({}, null, '?' + qs);
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
