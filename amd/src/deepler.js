// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/*
 * @module     local_deepler/deepler
 * @copyright  2022 Kaleb Heitzman <kaleb@jamfire.io>
 * @copyright  2024 Bruno Baudry <bruno.baudry@bfh.ch>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
// Import libs
import ajax from 'core/ajax';
import Selectors from "./selectors";
import Modal from 'core/modal';
import {get_string as getString} from "core/str";
import {escapeReplacementString, postprocess, preprocess} from "./tokeniser";


// Initialize the temporary translations dictionary @todo make external class
let tempTranslations = {};
let mainEditorType = '';
let config = {};
let autotranslateButton = {};
let checkboxes = [];
let sourceLang = "";
let targetLang = "";
let saveAllBtn = {};
let usage = {};
let format = new Intl.NumberFormat();
let saveAllModal = {};
let batchSaving = 0;
const escapePatterns = {};
let log = (...a) => {
    return a;
};
let warn = (...a) => {
    return a;
};
let info = (...a) => {
    return a;
};
let error = (...a) => {
    return a;
};
const debug = {
    NONE: 0,
    MINIMAL: 5,
    NORMAL: 15,
    ALL: 30719,
    DEVELOPER: 32767
};

const registerEventListeners = () => {
    document.addEventListener('change', e => {
        if (e.target.closest(Selectors.actions.targetSwitcher)) {
            switchTarget(e);
        }
        if (e.target.closest(Selectors.actions.sourceSwitcher)) {
            switchSource(e);
        }
        if (e.target.closest(Selectors.actions.showUpdated)) {
            showRows(Selectors.statuses.updated, e.target.checked);
        }
        if (e.target.closest(Selectors.actions.showNeedUpdate)) {
            showRows(Selectors.statuses.needsupdate, e.target.checked);
        }
        if (e.target.closest(Selectors.actions.checkBoxes) || e.target.closest(Selectors.actions.sourceselect)) {
            onItemChecked(e);
        }
    });
    document.addEventListener('click', e => {
        if (e.target.closest(Selectors.actions.toggleMultilang)) {
            onToggleMultilang(e.target.closest(Selectors.actions.toggleMultilang));
        }
        if (e.target.closest(Selectors.actions.autoTranslateBtn)) {
            if (config.currentlang === config.lang || config.lang === undefined) {
                Modal.create({
                    title: 'Cannot call deepl',
                    body: `<p>Both languges are the same {$config.lang}</p>`,
                    show: true,
                    removeOnClose: true,
                });
            } else {
                doAutotranslate();
            }
        }
        if (e.target.closest(Selectors.actions.selectAllBtn)) {
            toggleAllCheckboxes(e);
        }
        if (e.target.closest(Selectors.actions.saveAll)) {
            const selected = document.querySelectorAll(Selectors.statuses.checkedCheckBoxes);
            const allKeys = Array.from(selected).map((e) => e.dataset.key);
            log(allKeys);
            if (allKeys.length > 0) {
                launchModal();
                saveAllBtn.hidden = saveAllBtn.disabled = true;
                saveTranslations(allKeys);
            }
        }
    });

};
const registerUI = () => {
    try {
        saveAllBtn = document.querySelector(Selectors.actions.saveAll);
        sourceLang = document.querySelector(Selectors.actions.sourceSwitcher).value;
        targetLang = document.querySelector(Selectors.actions.targetSwitcher).value;
        autotranslateButton = document.querySelector(Selectors.actions.autoTranslateBtn);
        checkboxes = document.querySelectorAll(Selectors.actions.checkBoxes);
        // Initialise status object.
        checkboxes.forEach((node) => {
            tempTranslations[node.dataset.key] = {};
        });
    } catch (e) {
        if (config.debug) {
            error(e.message);
        }
    }
};
/**
 * Translation Editor UI.
 * @param {Object} cfg JS Config
 */
export const init = (cfg) => {
    log('init');
    config = cfg;
    usage = config.usage;
    // Preparing the debugger.
    if (config.debug === debug.MINIMAL) {
        error = window.console.error.bind(window.console);
    } else if (config.debug === debug.NORMAL) {
        error = window.console.error.bind(window.console);
        warn = window.console.warn.bind(window.console);
    } else if (config.debug === debug.ALL) {
        error = window.console.error.bind(window.console);
        warn = window.console.warn.bind(window.console);
        info = window.console.info.bind(window.console);
    } else if (config.debug === debug.DEVELOPER) {
        error = window.console.error.bind(window.console);
        warn = window.console.warn.bind(window.console);
        info = window.console.info.bind(window.console);
        log = window.console.log.bind(window.console);
    }
    info("DEEPLER loaded");
    log(config);
    warn("Deepl's usage", usage);
    error("testing developper level");
    mainEditorType = config.userPrefs;
    // Setup.
    registerUI();
    registerEventListeners();
    toggleAutotranslateButton();

    const selectAllBtn = document.querySelector(Selectors.actions.selectAllBtn);
    selectAllBtn.disabled = sourceLang === targetLang;
    /**
     * Validate translation ck
     */
    const validators = document.querySelectorAll(Selectors.actions.validatorsBtns);
    validators.forEach((item) => {
        // Get the stored data and do the saving from editors content
        item.addEventListener('click', (e) => {
            const _this = e.target.closest(Selectors.actions.validatorsBtns);
            const key = _this.dataset.keyValidator;
            const icon = document.querySelector(replaceKey(Selectors.actions.validatorBtn, key));
            let currentStatus = icon.getAttribute('data-status');
            if (tempTranslations[key] === null || tempTranslations[key] === undefined) {
                /**
                 * @todo do a UI feedback (disable save )
                 */
                error(`Translation key "${key}" is undefined `);
            } else if (currentStatus === Selectors.statuses.tosave) {
                saveTranslation(key);
            }
        });
    });
    /**
     * Selection Checkboxes
     */
    checkboxes.forEach((e) => {
        e.disabled = sourceLang === targetLang;
        e.addEventListener("click", () => {
            toggleAutotranslateButton();
        });
    });
    showRows(Selectors.statuses.updated, document.querySelector(Selectors.actions.showUpdated).checked);
    showRows(Selectors.statuses.needsupdate, document.querySelector(Selectors.actions.showNeedUpdate).checked);
};
const showErrorMessageForEditor = (key, message) => {
    let parent = document.querySelector(Selectors.editors.multiples.editorsWithKey.replace("<KEY>", key));
    const errorMsg = document.createElement('div');
    errorMsg.id = 'local_deepler__errormsg';
    errorMsg.classList = ['alert alert-danger'];
    errorMsg.innerHTML = message;
    parent.appendChild(errorMsg);
};
const hideErrorMessage = (key) => {
    let parent = document.querySelector(Selectors.editors.multiples.editorsWithKey.replace("<KEY>", key));
    let alertchild = parent.querySelector('.alert-danger');
    if (alertchild) {
        parent.removeChild(alertchild);
    }
};
/**
 * Opens a modal infobox to warn user trunks of fields are saving.
 * @returns {Promise<void>}
 */
const launchModal = async () => {
    // ...
    saveAllModal = await Modal.create({
        title: getString('saveallmodaltitle', 'local_deepler'),
        body: getString('saveallmodalbody', 'local_deepler'),
    });
    saveAllModal.show();
};

const successMessage = (key, element) => {
    element.classList.add("local_deepler__success");
    // Add saved indicator
    setIconStatus(key, Selectors.statuses.success);
    // Remove success message after a few seconds
    setTimeout(() => {
        let multilangPill = document.querySelector(replaceKey(Selectors.statuses.multilang, key));
        let prevTransStatus = document.querySelector(replaceKey(Selectors.statuses.prevTransStatus, key));
        prevTransStatus.classList = "badge badge-pill badge-success";
        if (multilangPill.classList.contains("disabled")) {
            multilangPill.classList.remove('disabled');
        }
        setIconStatus(key, Selectors.statuses.saved);
    });
};
const errorMessage = (key, editor, err) => {
    editor.classList.add("local_deepler__error");
    let hintError = '';
    // Most of the time DB error will come from translations starting to be too long.
    getString('errortoolong', 'local_deepler').then((s) => {
        hintError = s;
        setIconStatus(key, Selectors.statuses.failed);
        let message = err.message + ' ' + hintError;
        if (err.debuginfo) {
            // When Moodle is set to max debugger display the debuginfo.
            const setIndex = err.debuginfo.indexOf("SET") === -1 ? 15 : err.debuginfo.indexOf("SET");
            // message = err.message + '<br/>' + err.debuginfo.slice(0, setIndex) + '...';
            message = err.message + '<br/>' + err.debuginfo + ' ' + setIndex;
        }
        showErrorMessageForEditor(key, message);
    });
};
const getEditorText = (editor) => {
    let text = editor.innerHTML;
    if (mainEditorType === 'textarea') {
        text = decodeHTML(text);
    }
    return text;
};

const getSourceText = (key) => {
    const sourceTokenised = tempTranslations[key].source;
    return postprocess(sourceTokenised, tempTranslations[key].tokens);
};
const getElementAttributes = (element) => {
    return {
        id: parseInt(element.getAttribute("data-id")),
        tid: element.getAttribute("data-tid"),
        table: element.getAttribute("data-table"),
        field: element.getAttribute("data-field")
    };
};
const handleAjaxUpdateDBResponse = (data) => {
    data.forEach((item) => {
        log(item, Date(item.t_lastmodified * 1000));
        const key = keyidToKey(item.keyid);
        const htmlElement = document.querySelector(replaceKey(Selectors.editors.multiples.editorsWithKey, key));
        const multilangTextarea = document.querySelector(replaceKey(Selectors.editors.multiples.textAreas, key));
        if (item.t_lastmodified === -1) {
            errorMessage(key, tempTranslations[key].editor, item.text);
        } else {
            successMessage(key, htmlElement);
            multilangTextarea.innerHTML = item.text;
            // Deselect the checkbox.
            document.querySelector(Selectors.editors.multiples.checkBoxesWithKey.replace('<KEY>', key))
                .checked = false;
        }
    });
};
const saveTranslations = (keys) => {

    const data = [];
    keys.forEach((key) => {
            const icon = document.querySelector(replaceKey(Selectors.actions.validatorBtn, key));
            const currentStatus = icon.getAttribute('data-status');
            if (currentStatus === Selectors.statuses.tosave) {
                hideErrorMessage(key);
                data.push(prepareDbUpdatdeItem(key));
            }
        }
    );
    ajax.call([
        {
            methodname: "local_deepler_update_translation",
            args: {
                data: data,
            },
            done: (data) => {
                if (saveAllModal !== null && saveAllModal.isVisible) {
                    saveAllModal.hide();
                }
                if (data.length > 0) {
                    handleAjaxUpdateDBResponse(data);
                } else {
                    keys.forEach((key) => {
                        errorMessage(key, tempTranslations[key].editor, 'Something went wrong with the data');
                    });
                }
            },
            fail: (err) => {
                // An error occurred
                keys.forEach((key) => {
                    errorMessage(key, tempTranslations[key].editor, err);
                });
            },
        }
    ]);
};
const saveTranslation = (key) => {
    hideErrorMessage(key);
    ajax.call([
        {
            methodname: "local_deepler_update_translation",
            args: {
                data: [prepareDbUpdatdeItem(key)],
            },
            done: (data) => {
                if (saveAllModal !== null && saveAllModal.isVisible) {
                    batchSaving--;
                    log('batchSaving', batchSaving);
                    if (batchSaving === 0) {
                        saveAllModal.hide();
                    }
                }
                if (data.length > 0) {
                    handleAjaxUpdateDBResponse(data);
                } else {
                    errorMessage(key, tempTranslations[key].editor, 'Something went wrong with the data');
                }
            },
            fail: (err) => {
                // An error occurred
                errorMessage(key, tempTranslations[key].editor, err);
            },
        }
    ]);
};
const prepareDbUpdatdeItem = (key) => {
    const editor = tempTranslations[key].editor;
    const textTranslated = getEditorText(editor);
    const sourceText = getSourceText(key);
    const fieldText = tempTranslations[key].fieldText;
    const element = document.querySelector(replaceKey(Selectors.editors.multiples.editorsWithKey, key));
    const {id, tid, field, table} = getElementAttributes(element);
    const textTosave = getupdatedtext(fieldText, textTranslated, sourceText, tempTranslations[key].sourceLang);
    return {
        courseid: config.courseid,
        id: id,
        tid: tid,
        field: field,
        table: table,
        text: textTosave
    };
};
/**
 * Update Textarea
 * @param {string} fieldtext Latest text from database including all mlang tag if any.
 * @param {string} translation Translated Text to update.
 * @param {string} source Original text translated from.
 * @param {string} sourceItemLang The source language code
 * @returns {string}
 */
const getupdatedtext = (fieldtext, translation, source, sourceItemLang) => {
    const isFirstTranslation = fieldtext.indexOf("{mlang") === -1;
    const isSourceOther = sourceItemLang === sourceLang;
    const tagPatterns = {
        "other": "({mlang other)(.*?){mlang}",
        "target": `({mlang ${targetLang}}(.*?){mlang})`,
        "source": `({mlang ${sourceItemLang}}(.*?){mlang})`
    };
    const langsItems = {
        "fullContent": fieldtext,
        "other": `{mlang other}${source}{mlang}`,
        "target": `{mlang ${targetLang}}${translation}{mlang}`,
        "source": `{mlang ${sourceItemLang}}${source}{mlang}`
    };
    if (isFirstTranslation) {
        // No mlang tag : easy.
        if (isSourceOther) {
            return langsItems.other + langsItems.target;
        } else {
            return langsItems.other + langsItems.source + langsItems.target;
        }
    }
    // Alreaddy mlang tag-s.
    return additionalUpdate(isSourceOther, tagPatterns, langsItems);
};

/**
 * Update Textarea when there was mlang tags.
 * Main regex '({mlang ([a-z]{2,5})}(.*?){mlang})'.
 * @param {boolean} isSourceOther
 * @param {string} tagPatterns
 * @param {string} langsItems
 * @returns {string} {string}
 */
const additionalUpdate = (isSourceOther, tagPatterns, langsItems) => {
    let manipulatedText = langsItems.fullContent;
    // Do we have a TARGET tag already ?
    const targetReg = new RegExp(tagPatterns.target, "sg");
    const hasTagTarget = manipulatedText.match(targetReg);
    if (hasTagTarget) {
        // Yes replace it.
        manipulatedText = manipulatedText.replace(targetReg, escapeReplacementString(langsItems.target));
    } else {
        // No, add it at the end.
        const lastMlangClosingTagEnd = manipulatedText.lastIndexOf("{mlang}") + "{mlang}".length;
        manipulatedText = [manipulatedText.slice(0, lastMlangClosingTagEnd),
            langsItems.target,
            manipulatedText.slice(lastMlangClosingTagEnd)
        ].join('');
    }
    // Do we have a OTHER tag already ?
    const otherReg = new RegExp(tagPatterns.other, "sg");
    const hasTagOther = manipulatedText.match(otherReg);
    // Do we have a SOURCE tag already ?
    const sourceReg = new RegExp(tagPatterns.other, "sg");
    const hasTagSource = manipulatedText.match(sourceReg);
    if (isSourceOther) {
        // Whatever was the {mlang other} tag language we need to replace it by this source.
        manipulatedText = manipulatedText.replace(otherReg, escapeReplacementString(langsItems.other));
        if (hasTagSource) {
            // And remove the {mlang source} tag if found.
            manipulatedText.replace(sourceReg, "");
        }
    } else {
        if (!hasTagOther) {
            // We still add this source as otherTag of the so that it can be replaced further.
            const firstMlangClosingTagEnd = manipulatedText.indexOf("{mlang");
            manipulatedText = [manipulatedText.slice(0, firstMlangClosingTagEnd),
                langsItems.other,
                manipulatedText.slice(firstMlangClosingTagEnd)
            ].join('');
        }
        if (!hasTagSource) {
            // Add the {mlang source} tag if not found.
            manipulatedText.replace(sourceReg, escapeReplacementString(langsItems.source));
        }
    }
    return manipulatedText;
};
const onItemChecked = (e) => {
    log("SELECTION", e.target.getAttribute('data-key'), e.target.getAttribute('data-action'));
    const key = e.target.getAttribute('data-key');
    if (e.target.getAttribute('data-action') === "local_deepler/checkbox") {
        toggleStatus(key, e.target.checked);
        countWordAndChar();
    } else {
        initTempForKey(key, false);
    }
};
const initTempForKey = (key, blank) => {

    // Get the source text
    const sourceSelector = Selectors.sourcetexts.keys.replace("<KEY>", key);
    const sourceTextEncoded = document.querySelector(sourceSelector).getAttribute("data-sourcetext-raw");
    const multilangRawTextEncoded = document.querySelector(sourceSelector).getAttribute("data-filedtext-raw");
    const sourceText = fromBase64(sourceTextEncoded);
    const fieldText = fromBase64(multilangRawTextEncoded);
    const tokenised = preprocess(sourceText, escapePatterns, escapePatterns);
    // Store the settings.
    const editorSettings = findEditor(key);
    const sourceLang = document.querySelector(Selectors.sourcetexts.sourcelangs.replace("<KEY>", key)).value;
    // We make sure to initialize the record.
    tempTranslations[key] = {
        'editorType': null,
        'editor': null,
        'source': '',
        'sourceLang': '',
        'fieldText': '',
        'status': '',
        'translation': '',
        'tokens': []
    };
    if (!blank) {
        if (editorSettings === null || editorSettings.editor === null) {
            setIconStatus(key, Selectors.statuses.failed);
            showErrorMessageForEditor(key, 'Original editor not found...');
        } else {
            // Initialize status for the source content.
            tempTranslations[key] = {
                'editorType': editorSettings.editorType,
                'editor': editorSettings.editor,
                'source': tokenised.tokenizedText,
                'sourceLang': sourceLang,
                'fieldText': fieldText,
                'status': Selectors.statuses.wait,
                'translation': '',
                'tokens': tokenised.expressions
            };
        }
    }
};
const toggleStatus = (key, checked) => {
    const status = document.querySelector(replaceKey(Selectors.actions.validatorBtn, key)).dataset.status;
    switch (status) {
        case Selectors.statuses.wait :
            if (checked) {
                setIconStatus(key, Selectors.statuses.totranslate);
                initTempForKey(key, false);
            } else {
                initTempForKey(key, true);
            }
            break;
        case Selectors.statuses.totranslate :
            if (checked && tempTranslations[key]?.translation?.length > 0) {
                setIconStatus(key, Selectors.statuses.tosave, true);
            } else {
                setIconStatus(key, Selectors.statuses.wait);
            }
            break;
        case Selectors.statuses.tosave :
            if (!checked) {
                setIconStatus(key, Selectors.statuses.totranslate);
            }
            break;
        case Selectors.statuses.failed :
            break;
        case Selectors.statuses.success :
            break;
        case Selectors.statuses.saved :
            break;
    }
};
const setIconStatus = (key, s = Selectors.statuses.wait, isBtn = false) => {
    let icon = document.querySelector(replaceKey(Selectors.actions.validatorBtn, key));
    if (isBtn) {
        if (!icon.classList.contains('btn')) {
            icon.classList.add('btn');
            icon.classList.add('btn-outline-secondary');
        }
        if (icon.classList.contains('disable')) {
            icon.classList.remove('disable');
        }
    } else {
        if (!icon.classList.contains('disable')) {
            icon.classList.add('disable');
        }
        if (icon.classList.contains('btn')) {
            icon.classList.remove('btn');
            icon.classList.remove('btn-outline-secondary');
        }
    }
    icon.setAttribute('role', isBtn ? 'button' : 'status');
    icon.setAttribute('data-status', s);
};
/**
 * Shows/hides rows
 * @param {string} selector
 * @param {boolean} selected
 */
const showRows = (selector, selected) => {
    const items = document.querySelectorAll(selector);
    const allSelected = document.querySelector(Selectors.actions.selectAllBtn).checked;
    items.forEach((item) => {
        let k = item.getAttribute('data-row-id');
        toggleRowVisibility(item, selected);
        // When a row is toggled then we don't want it to be selected and sent from translation.
        try {
            item.querySelector(replaceKey(Selectors.editors.multiples.checkBoxesWithKey, k)).checked = allSelected && selected;
            toggleStatus(k, false);
        } catch (e) {
            log(`${k} translation is disalbled`);
        }

    });
    toggleAutotranslateButton();
    countWordAndChar();
};
const toggleRowVisibility = (row, checked) => {
    if (checked) {
        row.classList.remove("d-none");
    } else {
        row.classList.add("d-none");
    }
};
/**
 * Event listener to switch target lang
 * @param {Event} e
 */
const switchTarget = (e) => {
    let url = new URL(window.location.href);
    let searchParams = url.searchParams;
    searchParams.set("target_lang", e.target.value);
    window.location = url.toString();
};
/**
 * Event listener to switch source lang
 * Hence reload the page and change the site main lang
 * @param {Event} e
 */
const switchSource = (e) => {
    let url = new URL(window.location.href);
    let searchParams = url.searchParams;
    searchParams.set("lang", e.target.value);
    window.location = url.toString();
};
/**
 * Launch autotranslation
 */
const doAutotranslate = () => {
    saveAllBtn.hidden = saveAllBtn.disabled = false;
    document
        .querySelectorAll(Selectors.statuses.checkedCheckBoxes)
        .forEach((ckBox) => {
            let key = ckBox.getAttribute("data-key");
            if (tempTranslations[key].editor !== null) {
                getTranslation(key);
            }
        });
};
/**
 *
 * @returns {{}}
 */
const prepareAdvancedSettings = () => {
    info('prepareAdvancedSettings');
    let settings = {};
    escapePatterns.LATEX = document.querySelector(Selectors.actions.escapeLatex).checked;
    escapePatterns.PRETAG = document.querySelector(Selectors.actions.escapePre).checked;
    settings.tag_handling = document.querySelector(Selectors.deepl.tagHandling).checked ? 'html' : 'xml';//
    settings.context = document.querySelector(Selectors.deepl.context).value ?? null;//
    settings.split_sentences = document.querySelector(Selectors.deepl.splitSentences).value;//
    settings.preserve_formatting = document.querySelector(Selectors.deepl.preserveFormatting).checked;//
    settings.formality = document.querySelector('[name="local_deepler/formality"]:checked').value;
    settings.glossary_id = document.querySelector(Selectors.deepl.glossaryId).value;//
    settings.outline_detection = document.querySelector(Selectors.deepl.outlineDetection).checked;//
    settings.non_splitting_tags = toJsonArray(document.querySelector(Selectors.deepl.nonSplittingTags).value);
    settings.splitting_tags = toJsonArray(document.querySelector(Selectors.deepl.splittingTags).value);
    settings.ignore_tags = toJsonArray(document.querySelector(Selectors.deepl.ignoreTags).value);
    settings.target_lang = targetLang.toUpperCase();
    settings.auth_key = config.apikey;
    return settings;
};
const prepareTranslation = (key) => {
    return {
        text: tempTranslations[key].source,
        source_lang: tempTranslations[key].sourceLang,
    };
};
/**
 * Prepare the params for XHR call.
 *
 * @param {string} key
 * @param {boolean} url
 * @returns {URLSearchParams|FormData} Object to use in XHR.
 */
const prepareFormData = (key, url = true) => {
    let formData = url ? new URLSearchParams() : new FormData();
    Object.entries(prepareAdvancedSettings()).forEach(([k, v]) => {
        formData.append(k, v);
    });
    initTempForKey(key, false); // Reset temp translation in case setting changed.
    Object.entries(prepareTranslation(key)).forEach(([k, v]) => {
        formData.append(k, v);
    });
    return formData;
};


/**
 * @todo extract images ALT tags to send for translation
 * Send for Translation to DeepL
 * @param {Integer} key Translation Key
 */
const getTranslation = (key) => {
    const readystateDone = XMLHttpRequest.DONE ?? 4; // Workaround if undefined when JS is cached, need further investigation.
    // Initialize global dictionary with this key's editor.
    tempTranslations[key].staus = Selectors.statuses.wait;
    // Build formData
    let formData = prepareFormData(key);
    // log(tempTranslations);
    if (tempTranslations[key].editor === null) {
        error(`${key} no editor found :((`);
    } else {
        info("Send deepl:", formData);
        // Update the translation
        let xhr = new XMLHttpRequest();
        xhr.responseType = 'json';
        xhr.onreadystatechange = () => {
            if (xhr.readyState === readystateDone) {
                const status = xhr.status;
                if (status === 0 || (status >= 200 && status < 400)) {
                    // The request has been completed successfully
                    log(tempTranslations);
                    let data = xhr.responseType === 'text' || xhr.responseType === '' ? JSON.parse(xhr.responseText) : xhr.response;
                    info("From deepl:", data);
                    let tr = postprocess(data.translations[0].text, tempTranslations[key].tokens, escapePatterns);
                    // Display translation
                    log(tr);
                    tempTranslations[key].editor.innerHTML = tr;
                    // Store the translation in the global object
                    tempTranslations[key].translation = tr;
                    setIconStatus(key, Selectors.statuses.tosave, true);
                    injectImageCss(
                        tempTranslations[key].editorType,
                        tempTranslations[key].editor); // Hack for iframes based editors to highlight missing pictures.
                } else {
                    // Oh no! There has been an error with the request!
                    setIconStatus(key, Selectors.statuses.failed, false);
                }
            } else if (typeof xhr.readyState !== 'number') {
                // Workaround for the Adaptable theme that did change the return type of xhr.readyState.
                log('ERROR: Some JS library in your Moodle install are overriding the core functionalities in a wrong way.' +
                    'xhr.readyState MUST be of type "number"');
            }
        };
        xhr.open("POST", config.deeplurl);
        xhr.send(formData);
    }

};
/**
 *
 * @param {Integer} editorSettings
 * */
/**
 * Inject css to highlight ALT text of image not loaded because of @@POLUGINFILE@@
 * @param {string} editorType
 * @param {object} editor
 */
const injectImageCss = (editorType, editor) => {
    // Prepare css to inject in iframe editors
    const css = document.createElement('style');
    css.textContent = 'img{background-color:yellow !important;font-style: italic;}';
    if (editorType === "iframe") {
        let editorschildrens = Array.from(editor.parentElement.children);
        let found = false;
        for (let j in editorschildrens) {
            let e = editorschildrens[j];
            if (e.innerText === css.innerText) {
                found = true;
                break;
            }
        }
        if (!found) {
            editor.parentElement.appendChild(css);
        }
    }
};
/**
 * @todo get the editor from moodle db in the php.
 * Get the editor container based on recieved current user's
 * editor preference.
 * @param {Integer} key Translation Key
 */
const findEditor = (key) => {
    let e = document.querySelector(Selectors.editors.types.basic
        .replace("<KEY>", key));
    let et = 'basic';
    if (e === null) {
        let r = null;
        let editorTab = ["atto", "tiny", "marklar", "textarea"];
        if (editorTab.indexOf(mainEditorType) === -1) {
            warn('Unsupported editor ' + mainEditorType);
        } else {
            // First let's try the current editor.
            try {
                r = findEditorByType(key, mainEditorType);
            } catch (error) {
                // Content was edited by another editor.
                log(`Editor not found: ${mainEditorType} for key ${key}`);
            }
        }
        return r;
    } else {
        return {editor: e, editorType: et};
    }
};
/**
 * @param {string} key
 * @param {object} editorType
 * @returns {{editor: object, editorType: string}}
 */
const findEditorByType = (key, editorType) => {
    let et = 'basic';
    let ed = null;
    switch (editorType) {
        case "atto" :
            et = 'iframe';
            ed = document.querySelector(
                Selectors.editors.types.atto
                    .replaceAll("<KEY>", key));
            break;
        case "tiny":
            et = 'iframe';
            ed = document.querySelector(Selectors.editors.types.tiny
                .replaceAll("<KEY>", key))
                .contentWindow.tinymce;
            break;
        case 'marklar':
        case "textarea" :
            ed = document.querySelector(Selectors.editors.types.other
                .replaceAll("<KEY>", key));
            break;
    }
    return {editor: ed, editorType: et};
};
/**
 * Toggle checkboxes
 * @param {Event} e Event
 */
const toggleAllCheckboxes = (e) => {
    // Check/uncheck checkboxes
    if (e.target.checked) {
        checkboxes.forEach((i) => {
            // Toggle check box upon visibility
            i.checked = !getParentRow(i).classList.contains('d-none');
            toggleStatus(i.getAttribute('data-key'), i.checked);
        });
    } else {
        checkboxes.forEach((i) => {
            i.checked = false;
            toggleStatus(i.getAttribute('data-key'), false);
        });
    }
    toggleAutotranslateButton();
    countWordAndChar();
};
const getParentRow = (node) => {
    return node.closest(replaceKey(Selectors.sourcetexts.parentrow, node.getAttribute('data-key')));
};
/**
 * Toggle Autotranslate Button
 */
const toggleAutotranslateButton = () => {
    autotranslateButton.disabled = true;
    for (let i in checkboxes) {
        let e = checkboxes[i];
        if (e.checked) {
            autotranslateButton.disabled = false;
            break;
        }
    }
};
/**
 * Multilang button handler
 * @param {Event} e Event
 */
const onToggleMultilang = (e) => {
    let keyid = e.getAttribute('aria-controls');
    let key = keyidToKey(keyid);
    let source = document.querySelector(replaceKey(Selectors.sourcetexts.keys, key));
    let multilang = document.querySelector(replaceKey(Selectors.sourcetexts.multilangs, keyid));
    source.classList.toggle("show");
    multilang.classList.toggle("show");
};
/**
 * Json helper
 * @param {string} s
 * @param {string} sep
 * @returns {string}
 */
const toJsonArray = (s, sep = ",") => {
    return JSON.stringify(s.split(sep));
};
/**
 * Simple helper to manage selectors
 * @param {string} s
 * @param {string} k
 * @returns {*}
 */
const replaceKey = (s, k) => {
    return s.replace("<KEY>", k);
};
/**
 * Transforms a keyid to a key
 * @param {string} k
 * @returns {`${*}[${*}][${*}]`}
 */
const keyidToKey = (k) => {
    let m = k.match(/^(.+)-(.+)-(.+)$/i);
    return `${m[1]}[${m[2]}][${m[3]}]`;
};
/*
const getKeyFromComponents = (id, field, table) => {
    return `${table}[${id}][${field}]`;
};
*/
/**
 * Launch countWordAndChar
 */
const countWordAndChar = () => {
    let wrdsc = 0;
    let cws = 0;
    let cwos = 0;
    document
        .querySelectorAll(Selectors.statuses.checkedCheckBoxes)
        .forEach((ckBox) => {
            let key = ckBox.getAttribute("data-key");
            let results = getCount(key);
            wrdsc += results.wordCount;
            cwos += results.charNumWithOutSpace;
            cws += results.charNumWithSpace;
        });
    const wordCount = document.querySelector(Selectors.statuses.wordcount);
    const charWithSpace = document.querySelector(Selectors.statuses.charNumWithSpace);
    const charWOSpace = document.querySelector(Selectors.statuses.charNumWithOutSpace);
    const deeplUseSpan = document.querySelector(Selectors.statuses.deeplUsage);
    const deeplMaxSpan = document.querySelector(Selectors.statuses.deeplMax);
    const parent = document.querySelector(Selectors.statuses.deeplStatusContainer);
    let current = cwos + usage.character.count;
    wordCount.innerText = wrdsc;
    charWithSpace.innerText = cws;
    charWOSpace.innerText = cwos;
    deeplUseSpan.innerText = format.format(current);
    deeplMaxSpan.innerText = usage.character.limit === null ? '∞' : format.format(usage.character.limit);
    if (current >= usage.character.limit) {
        parent.classList.remove('alert-success');
        parent.classList.add('alert-danger');
    } else {
        parent.classList.add('alert-success');
        parent.classList.remove('alert-danger');
    }
};
/**
 * @param {string} key
 * @return {object}
 */
const getCount = (key) => {
    const item = document.querySelector(replaceKey(Selectors.sourcetexts.keys, key));
    const raw = item.getAttribute("data-sourcetext-raw");
    const sourceText = stripHTMLTags(fromBase64(raw));
    return countChars(sourceText);
};
/**
 *
 * @param {String} val
 * @returns {{wordCount: *, charNumWithSpace: *, charNumWithOutSpace: *}}
 */
const countChars = (val) => {
    const trimmedVal = val.trim();
    const withSpace = trimmedVal.length;
    const withOutSpace = trimmedVal.replace(/\s+/g, '').length;
    const wordsCount = (trimmedVal.match(/\S+/g) || []).length;
    return {
        "wordCount": wordsCount,
        "charNumWithSpace": withSpace,
        "charNumWithOutSpace": withOutSpace
    };
};
/**
 * Helper function to decode the PHP base64 encoded source.
 * @param {string} encoded
 * @returns {string}
 */
const fromBase64 = (encoded) => {
    const binString = atob(encoded); // Maybe we should import js-base64 instead.
    const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0));
    return new TextDecoder().decode(bytes);
};
/**
 * Helper function for the decode html escaped content.
 * @param {string} encodedStr
 * @returns {string}
 */
const decodeHTML = (encodedStr) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(encodedStr, 'text/html');
    return doc.documentElement.textContent;
};
/**
 * Helper to remove HTML from strings.
 *
 * @param {string} str
 * @returns {string|string}
 */
const stripHTMLTags = (str) => {
    let doc = new DOMParser().parseFromString(str, 'text/html');
    return doc.body.textContent || "";
};
