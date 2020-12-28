'use strict';

var newGameButton = document.getElementById('new-game-button');
var undoButton = document.getElementById('undo-button');
var saveGameButton = document.getElementById('save-game-button');
var solveButton = document.getElementById('solve-button');
var aboutButton = document.getElementById('about-button');
var ngForm = document.getElementById('ng-form');
var ngFormSubmitButton = document.getElementById('ng-submit');
var solveMenu = document.getElementById('solve-menu');
var solveList = document.getElementById('solve-list');
var unpackButton = document.getElementById('unpack-button');
var msgList = document.getElementById('msg-list');

var aboutText = "This is a 2D geometric bin-packing game. You have to pack all items from "
    + "the left side into the minimum number of bins on the right side.";

function ngFormSuccess() {
    ngForm.classList.add('disabled');
    ngForm.classList.remove('enabled');
    ngForm.classList.remove('loading');
    newGameButton.classList.remove('pressed');
}

function ngFormCheckHandler(ev) {
    const formData = new FormData(ngForm);
    var choice = formData.get('ng-choice');
    if(choice === null) {
        ngFormSubmitButton.setAttribute('disabled', 'disabled');
    }
    else {
        ngFormSubmitButton.removeAttribute('disabled');
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
        loadGameFromGen(src, {}, null, ngFormSuccess, failHook);
        var qs = toQueryString({'srctype': srctype, 'src': src});
        window.history.replaceState({}, null, '?' + qs);
    }
}

function solveSuccess() {
    solveMenu.classList.add('disabled');
    solveMenu.classList.remove('enabled');
    solveButton.classList.remove('pressed');
}

function solveClickHandler(ev) {
    ev.preventDefault();
    var algoName = ev.target.innerHTML;
    globalGame.selectSolution(algoName);
    solveSuccess();
}

function repopulateSolveMenu() {
    var solutions = globalGame.level.solutions;
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

    solveList.innerHTML = '';
    for(let key of keys) {
        var liElem = document.createElement('li');
        liElem.innerHTML = key;
        liElem.addEventListener('click', solveClickHandler);
        solveList.appendChild(liElem);
    }
}

function addExtraUIEventListeners() {
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
    unpackButton.addEventListener('click', function(ev) {
            globalGame.putBack();
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
    msgList.appendChild(liElem);
}
