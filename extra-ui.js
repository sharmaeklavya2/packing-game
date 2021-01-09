'use strict';

var undoButton = document.getElementById('undo-button');
var redoButton = document.getElementById('redo-button');
var ngForm = document.getElementById('ng-form');
var ngFormRawTextarea = document.getElementById('ng-raw');
var buttonToMenuMap = new Map([
    ['new-game-button', 'ng-form'],
    ['solutions-button', 'solutions-menu'],
    ['auto-pack-button', 'auto-pack-menu'],
    ['export-button', 'export-menu'],
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

function autoPackSuccess() {
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
    game.selectAutoPack(algoName);
    autoPackSuccess();
}

function repopulateSolveMenu(solutions) {
    let a = [[solutions, 'solutions', solutionsClickHandler],
        [bpAlgos, 'auto-pack', autoPackClickHandler]];
    for(let [solMap, domKey, clickHandler] of a) {
        let listDomElem = document.getElementById(domKey + '-list');
        listDomElem.innerHTML = '';
        let button = document.getElementById(domKey + '-button');
        if(solMap.size === 0) {
            button.classList.add('disabled');
        }
        else {
            button.classList.remove('disabled');
        }
        for(let key of solMap.keys()) {
            let liElem = document.createElement('li');
            liElem.innerHTML = key;
            liElem.addEventListener('click', clickHandler);
            listDomElem.appendChild(liElem);
        }
    }
}

function repopulateAutoPackMenu() {
    let autoPack = game.level.autoPack;
    let autoPackList = document.getElementById('auto-pack-list');
    autoPackList.innerHTML = '';
    for(let key of bpAlgos.keys()) {
        let liElem = document.createElement('li');
        liElem.innerHTML = key;
        liElem.addEventListener('click', autoPackClickHandler);
        autoPackList.appendChild(liElem);
    }
}

function populateNgForm() {
    let levels = [
        ['levels/bp/1.json', 'Level 1'],
        ['levels/bp/2.json', 'Level 2'],
        ['levels/bp/3.json', 'Level 3'],
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
    document.getElementById('zoom-button').addEventListener('click', function(ev) {
            toggleMenus('zoom-button');
        });
    document.getElementById('save-game-button').addEventListener('click', function(ev) {
            if(game !== null) {downloadProgress();}
        });
    document.getElementById('unpack-button').addEventListener('click', function(ev) {
            game.putBack();
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
    document.getElementById('auto-pack-button').addEventListener('click', function(ev) {
            toggleMenus('auto-pack-button');
        });
    document.getElementById('export-button').addEventListener('click', function(ev) {
            toggleMenus('export-button');
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

    document.getElementById('export-li-tikz').addEventListener('click', function(ev) {
            if(game.nBinsUsed == 0) {
                addMsg('error', 'No bins have been used; nothing to export.');
            }
            document.getElementById('export-button').classList.remove('pressed');
            document.getElementById('export-menu').classList.add('disabled');
        });
    document.getElementById('export-li-pdf').addEventListener('click', function(ev) {
            if(game.nBinsUsed == 0) {
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
