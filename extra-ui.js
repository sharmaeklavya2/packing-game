'use strict';

var undoButton = document.getElementById('undo-button');
var ngForm = document.getElementById('ng-form');

var aboutText = "This is a 2D geometric bin-packing game. You have to pack all items from "
    + "the left side into the minimum number of bins on the right side.";

function ngFormSuccess() {
    ngForm.classList.add('disabled');
    ngForm.classList.remove('enabled');
    ngForm.classList.remove('loading');
    var newGameButton = document.getElementById('new-game-button');
    newGameButton.classList.remove('pressed');
}

function getPersistentHeaderHeight() {
    return document.getElementById('toolbar').getBoundingClientRect().height;
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
    var solveMenu = document.getElementById('solve-menu');
    solveMenu.classList.add('disabled');
    solveMenu.classList.remove('enabled');
    var solveButton = document.getElementById('solve-button');
    solveButton.classList.remove('pressed');
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
populateNgForm();

function addExtraUIEventListeners() {
    undoButton.addEventListener('click', function(ev) {
            if(game !== null) {game.undo();}
        });
    document.getElementById('save-game-button').addEventListener('click', function(ev) {
            if(game !== null) {downloadProgress();}
        });
    document.getElementById('about-button').addEventListener('click', function(ev) {
            window.alert(aboutText);
        });
    var newGameButton = document.getElementById('new-game-button');
    var solveButton = document.getElementById('solve-button');
    var solveMenu = document.getElementById('solve-menu');
    newGameButton.addEventListener('click', function(ev) {
            solveMenu.classList.add('disabled');
            solveMenu.classList.remove('enabled');
            ngForm.classList.toggle('disabled');
            ngForm.classList.toggle('enabled');
            ngForm.classList.remove('loading');
            solveButton.classList.remove('pressed');
            newGameButton.classList.toggle('pressed');
        });
    ngForm.addEventListener('submit', ngFormSubmitHandler);
    ngForm.addEventListener('change', ngFormCheckHandler);
    ngForm.addEventListener('input', ngFormCheckHandler);
    solveButton.addEventListener('click', function(ev) {
            ngForm.classList.add('disabled');
            ngForm.classList.remove('enabled');
            solveMenu.classList.toggle('disabled');
            solveMenu.classList.toggle('enabled');
            newGameButton.classList.remove('pressed');
            solveButton.classList.toggle('pressed');
        });
    document.getElementById('unpack-button').addEventListener('click', function(ev) {
            game.putBack();
        });
}

function disableUndoButton() {
    undoButton.classList.add('disabled');
    undoButton.classList.remove('enabled');
}
function enableUndoButton() {
    undoButton.classList.remove('disabled');
    undoButton.classList.add('enabled');
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
