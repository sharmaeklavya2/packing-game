// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3
// Copyright (C) 2020-2021 Eklavya Sharma. Licensed under GNU GPLv3.
'use strict';

var undoButton = document.getElementById('undo-button');
var redoButton = document.getElementById('redo-button');
var editForm = document.getElementById('edit-form');
var modalGroup = document.getElementById('modal-group');

var buttonToMenuMap = new Map([
    ['new-game-button', 'ng-menu'],
    ['solutions-button', 'solutions-menu'],
    ['auto-pack-button', 'auto-pack-menu'],
    ['export-button', 'export-menu'],
    ['zoom-button', 'zoom-toolbar'],
    ['edit-button', 'edit-form'],
    ['about-button', 'about-menu'],
]);

class DomChooser {
    constructor(yesClass, noClass, activeId=null) {
        this.yesClass = yesClass;
        this.noClass = noClass;
        this.activeId = activeId;
        if(activeId === null) {
            this.activeElem = null;
        }
        else {
            this.activeElem = document.getElementById(activeId);
            console.assert(this.activeElem !== null, 'id ' + id + ' not found in DOM.');
        }
    }

    unset(id=null) {
        if(this.activeId !== null && (id === null || id === this.activeId)) {
            if(this.yesClass) {
                this.activeElem.classList.remove(this.yesClass);
            }
            if(this.noClass) {
                this.activeElem.classList.add(this.noClass);
            }
            this.activeElem = null;
            this.activeId = null;
        }
    }

    _set(id) {
        this.activeId = id;
        this.activeElem = document.getElementById(id);
        console.assert(this.activeElem !== null, 'id ' + id + ' not found in DOM.');
        if(this.yesClass) {
            this.activeElem.classList.add(this.yesClass);
        }
        if(this.noClass) {
            this.activeElem.classList.remove(this.noClass);
        }
    }

    select(id, toggle=false) {
        if(this.activeId === id) {
            if(toggle) {this.unset();}
        }
        else {
            this.unset();
            this._set(id);
        }
    }
}

var toolbarButtonChooser = new DomChooser('pressed', null);
var menuChooser = new DomChooser(null, 'disabled');

function toggleFromToolbar(buttonId) {
    toolbarButtonChooser.select(buttonId, true);
    menuChooser.select(buttonToMenuMap.get(buttonId), true);
}
function unsetToolbar(buttonId=null) {
    const menuId = buttonToMenuMap.get(buttonId) || null;
    toolbarButtonChooser.unset(buttonId);
    menuChooser.unset(menuId);
}

function getPersistentHeaderHeight() {
    return document.getElementById('main-toolbar').getBoundingClientRect().height;
}

function createGenParamsInputs(genName, container) {
    for(const [paramName, param] of levelGenerators.get(genName).paramMap) {
        let div = document.createElement('div');
        div.classList.add('input-pair');
        let id = 'ng-gen-' + genName + '-param-' + paramName;
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
        inputElem.addEventListener('focus', () => {handleKeyPresses = false;});
        inputElem.addEventListener('blur', () => {handleKeyPresses = true;});

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

        container.appendChild(div);
    }
}

function createGenParamsMenu(genName, menuId) {
    let menu = document.createElement('form');
    menu.setAttribute('id', menuId);
    menu.classList.add('menu', 'disabled');
    let header = document.createElement('header');
    menu.appendChild(header);
    let options = document.createElement('div');
    options.classList.add('options', 'menu-body');
    menu.appendChild(options);
    let submit = document.createElement('button');
    submit.setAttribute('type', 'submit');
    submit.innerHTML = 'Submit';
    menu.appendChild(submit);

    let backBtn = document.createElement('div');
    backBtn.classList.add('back-btn');
    backBtn.addEventListener('click', (ev) => menuChooser.select('ng-gen-menu'));
    header.appendChild(backBtn);
    let heading = document.createElement('div');
    heading.classList.add('heading');
    heading.innerHTML = 'Enter parameters for ' + genName;
    header.appendChild(heading);
    let closeBtn = document.createElement('div');
    closeBtn.classList.add('close-btn');
    header.appendChild(closeBtn);

    createGenParamsInputs(genName, options);

    menu.addEventListener('submit', function(ev) {
        ev.preventDefault();
        let q = {'srctype': 'gen', 'src': genName}
        const formData = new FormData(menu);
        for(let [key, value] of formData.entries()) {
            if(value !== '') {
                q[key] = value;
            }
        }
        const qs = toQueryString(q);
        function succHook() {
            window.history.replaceState({}, null, '?' + qs);
            toolbarButtonChooser.unset('new-game-button');
            menuChooser.unset(menuId);
            modalGroup.classList.remove('loading');
            resetReloadButton();
        }
        modalGroup.classList.add('loading');
        loadGameFromGen(genName, q, null, succHook, toolbarFailHook);
    });
    return menu;
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

function showSolutionSuccess() {
    unsetToolbar('solutions-button');
}

function autoPackComplete() {
    unsetToolbar('auto-pack-button');
    modalGroup.classList.remove('loading');
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
    modalGroup.classList.add('loading');
    window.setTimeout(() => game.selectAutoPack(
        algoName, null, autoPackComplete, autoPackComplete, null));
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

function addToolbarEventListeners() {
    document.getElementById('new-game-button').addEventListener('click', function(ev) {
            toggleFromToolbar('new-game-button');
            modalGroup.classList.remove('loading');
        });
    document.getElementById('reload-button').addEventListener('click', function(ev) {
            if(gameLoadParams !== null) {
                toolbarButtonChooser.select('reload-button');
                function succHook() {toolbarButtonChooser.unset('reload-button');}
                function failHook(msg) {succHook(); addMsg('error', msg);}
                loadGameFromQParams(gameLoadParams, succHook, failHook);
            }
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
    document.getElementById('share-button').addEventListener('click', function(ev) {
            if(game !== null) {
                function succHook() {addMsg('success', 'URL copied to clipboard');}
                function failHook(reason) {addMsg('error', 'Could not copy URL to clipboard: ' + reason);}
                copyLevelURLToClipboard(succHook, failHook);
            }
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
                    toggleFromToolbar('solutions-button');
                }
            }
        });
    document.getElementById('dark-mode-button').addEventListener('click', function(ev) {
            document.body.classList.toggle('light');
            document.body.classList.toggle('dark');
            document.documentElement.style.setProperty('color-scheme',
                (document.body.classList.contains('dark') ? 'dark' : 'light'));
            try {
                if(window.localStorage.getItem('dark')) {
                    window.localStorage.removeItem('dark');
                }
                else {
                    window.localStorage.setItem('dark', '1');
                }
            }
            catch(e) {
                console.warn('setting localStorage failed: ' + e);
            }
        });
    let onlyToggleIds = ['about-button', 'zoom-button', 'auto-pack-button',
        'export-button', 'edit-button'];
    for(const id of onlyToggleIds) {
        document.getElementById(id).addEventListener('click', (ev) => toggleFromToolbar(id));
    }
}

function addZoomEventListeners() {
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
}

function addExportEventListeners() {
    document.getElementById('export-li-tikz').addEventListener('click', function(ev) {
            if(game.nBinsUsed === 0) {
                addMsg('error', 'No bins have been used; nothing to export.');
            }
            downloadBinsToTikz();
            unsetToolbar('export-button');
        });
    document.getElementById('export-li-svg').addEventListener('click', function(ev) {
            downloadAsSvg();
            unsetToolbar('export-button');
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
            unsetToolbar('export-button');
        });
}

var menuTraversalList = [
    ['ng-menu', 'ng-url', 'ng-url-menu'],
    ['ng-menu', 'ng-gen', 'ng-gen-menu'],
    ['ng-menu', 'ng-json', 'ng-json-menu'],
];

function toolbarFailHook(msg) {
    addMsg('error', msg);
    toolbarButtonChooser.unset();
    menuChooser.unset();
    modalGroup.classList.remove('loading');
}

function addNgMenuEventListeners() {
    for(const [oldMenuId, buttonId, newMenuId] of menuTraversalList) {
        document.getElementById(buttonId).addEventListener('click',
            (ev) => menuChooser.select(newMenuId));
        document.querySelector(`#${newMenuId} .back-btn`).addEventListener('click',
            (ev) => menuChooser.select(oldMenuId));
    }
    function succHookWrapper(menuName, qs) {
        window.history.replaceState({}, null, '?' + qs);
        toolbarButtonChooser.unset('new-game-button');
        menuChooser.unset(menuName);
        modalGroup.classList.remove('loading');
        resetReloadButton();
    }
    document.getElementById('ng-url-list').addEventListener('click', function(ev) {
        const url = ev.target.getAttribute('data-url');
        const qs = toQueryString({'srctype': 'url', 'src': url});
        modalGroup.classList.add('loading');
        loadGameFromUrl(url, null, () => succHookWrapper('ng-url-menu', qs), toolbarFailHook);
    });
    document.getElementById('ng-upload').addEventListener('click', function(ev) {
        loadGameFromUpload(null, () => succHookWrapper('ng-menu', ''), toolbarFailHook);
    });
    let textarea = document.getElementById('ng-json-input');
    document.getElementById('ng-json-submit').addEventListener('click', function(ev) {
        let j = textarea.value;
        modalGroup.classList.add('loading');
        loadGameFromJsonString(j, null, () => succHookWrapper('ng-json-menu', ''), toolbarFailHook);
    });
    textarea.addEventListener('focus', () => {handleKeyPresses = false;});
    textarea.addEventListener('blur', () => {handleKeyPresses = true;});

    let genList = document.getElementById('ng-gen-list');
    let modalGroup = document.getElementById('modal-group');
    let modalOverlay = document.getElementById('modal-overlay');
    for(const [genName, gen] of levelGenerators) {
        let liElem = document.createElement('li');
        liElem.setAttribute('data-gen', genName);
        liElem.innerHTML = genName;
        genList.appendChild(liElem);
        const menuId = 'ng-gen-' + genName + '-menu';
        liElem.addEventListener('click', (ev) => menuChooser.select(menuId));

        let menu = createGenParamsMenu(genName, menuId);
        modalGroup.insertBefore(menu, modalOverlay);
    }
}

function addExtraUIEventListeners() {
    addToolbarEventListeners();
    addZoomEventListeners();
    addExportEventListeners();
    addNgMenuEventListeners();

    editForm.addEventListener('change', editFormCheckHandler);
    editForm.addEventListener('input', editFormCheckHandler);

    for(let elem of document.querySelectorAll('.menu .close-btn')) {
        elem.addEventListener('click', (ev) => unsetToolbar());
    }
    document.querySelector('#modal-group > .overlay').addEventListener('click',
        (ev) => unsetToolbar());

    document.body.addEventListener('drop', function(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'copy';
        function succHook() {
            resetReloadButton();
            window.history.replaceState({}, null, '?');
        }
        function failHook(msg) {addMsg('error', msg);}
        if(ev.dataTransfer.files.length > 0) {
            loadGameFromFiles(ev.dataTransfer.files, null, succHook, failHook);
        }
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
        closeButton.classList.add('close-btn');
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
    const canvasOffX = Math.floor(width / 2), canvasOffY = Math.floor(height / 3);

    const n = 50;
    let ux = [], uy = [], hues = [];
    for(let i=0; i<n; ++i) {
        ux[i] = 2 * Math.random() - 1;
        uy[i] = 2 * Math.random() - 1;
        hues[i] = 6 * Math.floor(30 * Math.random());
    }

    function terminateAnimation() {
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
        ctx.clearRect(0, 0, width, height);
        for(let i=0; i<n; ++i) {
            const x = ux[i]*vScale*t, y = uy[i]*vScale*t + g*t*t / 2;
            const alpha = Math.max(0, 1 - t/2);
            ctx.fillStyle = `hsla(${hues[i]}, 100%, 50%, ${alpha})`;
            ctx.beginPath();
            ctx.arc(canvasOffX + x*minDim, canvasOffY + y*minDim, 8, 0, 2 * Math.PI, true);
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

function initThemeFromLocalStorage() {
    try {
        if(window.localStorage.getItem('dark')) {
            document.body.classList.remove('light');
            document.body.classList.add('dark');
            document.documentElement.style.setProperty('color-scheme', 'dark');
        }
    }
    catch(e) {
        console.warn('initializing from localStorage failed: ' + e);
    }
}

function resetReloadButton() {
    let reloadButton = document.getElementById('reload-button');
    if(gameLoadParams !== null) {
        reloadButton.classList.remove('disabled');
    }
    else {
        reloadButton.classList.add('disabled');
    }
}
// @license-end
