'use strict';

var newGameButton = document.getElementById('new-game-button');
var undoButton = document.getElementById('undo-button');
var saveGameButton = document.getElementById('save-game-button');
var aboutButton = document.getElementById('about-button');
var ngForm = document.getElementById('ng-form');
var msgList = document.getElementById('msg-list');

var aboutText = "This is a 2D geometric bin-packing game. You have to pack all items from "
    + "the left side into the minimum number of bins on the right side.";

function ngFormSuccess() {
    ngForm.classList.add('disabled');
    ngForm.classList.remove('enabled');
    ngForm.classList.remove('loading');
    newGameButton.classList.remove('pressed');
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
            ngForm.classList.toggle('disabled');
            ngForm.classList.toggle('enabled');
            ngForm.classList.remove('loading');
            newGameButton.classList.toggle('pressed');
        });
    ngForm.addEventListener('submit', ngFormSubmitHandler);
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
