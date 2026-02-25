// script.js

// ----------------------
// Element queries & globals
// ----------------------
const textArea = document.getElementById('text-area');
const statArea = document.getElementById('stat-area');
const stat_info = document.querySelector('#stat-info');
const stat_str = document.getElementById('stat-str');
const voice = document.getElementById('voices');
const saveButton = document.querySelector('.save');
const settingsButton = document.getElementById('settingsbutton');
const pointsSelect = document.querySelector('.pointsselect');
const pointsType = document.getElementById('pointstype');
const fileInputLex = document.getElementById('file-input-lex');
const fileInput = document.getElementById('file-input');
const fileButtonLex = document.getElementById('file-button-lex');
const fileButton = document.getElementById('file-button');
const dopSettings = document.getElementById('dop-settings-label');
const pitch = document.querySelector('.pitch');
const pitch_str = document.getElementById('pitch-str');
const rate = document.querySelector('.rate');
const rate_str = document.getElementById('rate-str');
const max_threads = document.querySelector('.max-threads');
const max_threads_int = document.getElementById('max-threads-int');
const mergefiles = document.querySelector('.mergefiles');
const mergefiles_str = document.getElementById('mergefiles-str');

// ----------------------
// Global constants for file processing
// ----------------------
const FIRST_STRINGS_SIZE = 50;
const LAST_STRINGS_SIZE = 100;

// ----------------------
// Global variables
// ----------------------
let baseText = "";
var lexx = [];
var book;
var book_loaded = false;
var parts_book = [];
var file_name_ind = 0;
var num_book = 0;
var num_text = 0;
var fix_num_book = 0;
var threads_info = { count: parseInt(max_threads.value), stat: stat_str };
var run_work = false;
var save_path_handle;

// ----------------------
// Help system
// ----------------------
const helpSection = document.querySelector('.help-section');
const helpTitle = document.getElementById('help-title');
const helpText = document.getElementById('help-text');

function showHelp(title, text) {
  helpTitle.textContent = title;
  helpText.textContent = text;
  helpSection.classList.add('show');
}

function hideHelp() {
  helpSection.classList.remove('show');
}

pointsType.addEventListener('click', () => {
  const mode = pointsType.textContent;
  const helpTexts = {
    'V1': 'Replaces all periods in the text with the selected character.',
    'V2': 'Preserves periods at line endings, but replaces all other periods with the selected character.',
    'V3': 'Preserves periods at line endings, and replaces only periods followed by spaces with the selected character plus a space.'
  };
  showHelp('Period Replacement Mode: ' + mode, helpTexts[mode]);
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.help-section') && !e.target.closest('#pointstype')) {
    hideHelp();
  }
});

// ----------------------
// Event listeners
// ----------------------
saveButton.addEventListener('click', e => start());
dopSettings.addEventListener('click', e => change_dopSettings());
settingsButton.addEventListener('click', e => lite_mod());
rate.addEventListener('input', e => {
  rate_str.textContent = rate.value >= 0 ? `+${rate.value}%` : `${rate.value}%`;
});
pitch.addEventListener('input', e => {
  pitch_str.textContent = pitch.value >= 0 ? `+${pitch.value}Hz` : `${pitch.value}Hz`;
});
max_threads.addEventListener('input', e => {
  max_threads_int.textContent = max_threads.value;
});
mergefiles.addEventListener('input', e => {
  mergefiles_str.textContent = mergefiles.value == 100 ? "ALL" : `${mergefiles.value} pcs.`;
});
window.addEventListener('beforeunload', function(event) { save_settings(); });

stat_info.addEventListener('click', () => {
  if (textArea.style.display === 'none') {
    statArea.style.display = statArea.style.display === 'none' ? 'block' : 'none';
  }
});

// ----------------------
// Live display update
// ----------------------
function updateLive() {
  const select = document.querySelector('#pointsselect');
  const pointType = document.getElementById('pointstype');
  
  if (select.value === "Replace carriage return/newline with space") {
    pointType.innerHTML = "V1";
    document.getElementById("version-warning").style.display = "block";
  } else {
    document.getElementById("version-warning").style.display = "none";
  }
  
  if (!baseText) return;
  
  let updatedText = baseText;
  const selectValue = select.value;
  const pointTypeValue = pointType.innerHTML;
  
  if (selectValue === "Replace carriage return/newline with space") {
    updatedText = updatedText.replace(/[\r\n]+/g, ' ');
  } else if (selectValue === "Replace with three lines") {
    updatedText = updatedText.replace(/\./g, '\r\n\r\n\r\n\r\n');
  } else if (selectValue !== "Don't replace periods") {
    const new_point = selectValue[selectValue.length - 1];
    if (pointTypeValue === "V1") {
      updatedText = updatedText.replace(/\./g, new_point);
    } else if (pointTypeValue === "V2") {
      updatedText = updatedText
        .replace(new RegExp('\\.[ \\t]{1,}\\n', 'g'), '.\n')
        .replace(new RegExp('\\.(?![\\r\\n])', 'g'), new_point);
    } else if (pointTypeValue === "V3") {
      updatedText = updatedText
        .replace(new RegExp('\\.[ \\t]{1,}\\n', 'g'), '.\n')
        .replace(new RegExp('\\.[ \\t]', 'g'), new_point + ' ');
    }
  }
  
  textArea.value = updatedText;
}

function updatePointType() {
  updateLive();
}

function points_mod() {
  if (pointsType.innerHTML === "V1") {
    if (pointsSelect.value !== "Replace carriage return/newline with space") {
      pointsType.innerHTML = "V2";
    }
  } else if (pointsType.innerHTML === "V2") {
    pointsType.innerHTML = "V3";
  } else if (pointsType.innerHTML === "V3") {
    pointsType.innerHTML = "V1";
  }
  updateLive();
}

// ----------------------
// File processing
// ----------------------
function get_text(_filename, _text, is_file) {
  statArea.value = "";
  if (is_file === true) {
    textArea.value = "";
  }
  
  if (book && is_file) {
    book.addNewText(_filename, _text);
  } else {
    if (book) {
      book.clear();
      book = null;
    }
    book = new ProcessingFile(_filename, _text, FIRST_STRINGS_SIZE, LAST_STRINGS_SIZE, lexx);
  }
  
  baseText = book.all_sentences.join("\n\n");
  updateLive();
  
  statArea.value = "File loaded.\n";
  stat_str.textContent = `0 / ${book.all_sentences.length}`;
  
  clear_old_run();
}

function clear_old_run() {
  if (parts_book) {
    for (let part of parts_book) {
      if (part) part.clear();
    }
  }
  parts_book = [];
  file_name_ind = 0;
  num_book = 0;
  fix_num_book = 0;
  threads_info = { count: parseInt(max_threads.value), stat: stat_str };
}

// ----------------------
// TTS engine
// ----------------------
function add_edge_tts(merge) {
  if (run_work === true) {
    if (book && num_book < threads_info.count) {
      let file_name = book.file_names[file_name_ind][0];
      setTimeout(function() {
        if (threads_info.count < parseInt(max_threads.value)) {
          threads_info.count = parseInt(max_threads.value);
        }
        if (num_book < threads_info.count && num_book < book.all_sentences.length) {
          if (book.file_names[file_name_ind][1] > 0 && book.file_names[file_name_ind][1] <= num_book) {
            file_name_ind += 1;
            file_name = book.file_names[file_name_ind][0];
            fix_num_book = num_book;
          }
          
          let partNumber = num_book + 1 - fix_num_book;
          let tts_text = book.all_sentences[num_book];
          
          if (pointsSelect.value === "Replace carriage return/newline with space") {
            tts_text = tts_text.replace(/[\r\n]+/g, ' ');
          }
          
          parts_book.push(
            new SocketEdgeTTS(
              num_book,
              file_name,
              partNumber.toString(),
              "Microsoft Server Speech Text to Speech Voice (" + voice.value + ")",
              String(pitch_str.textContent),
              rate_str.textContent,
              "+0%",
              tts_text,
              statArea,
              threads_info,
              merge
            )
          );
          num_book += 1;
        }
      }, 100);
    }
    if (merge) do_marge();
  }
}

function get_audio() {
  clear_old_run();
  run_work = true;
  stat_info.textContent = "Processed";
  const stat_count = stat_str.textContent.split(' / ');
  stat_str.textContent = "0 / " + stat_count[1];
  const merge = (mergefiles.value == 1) ? false : true;
  
  if (!book_loaded) {
    num_text += 1;
    get_text("Text " + (num_text).toString().padStart(4, '0'), textArea.value, false);
  }
  add_edge_tts(merge);
}

// ----------------------
// File saving (merge path)
// ----------------------
async function saveFiles(filename, fix_filename, blob, from_ind, to_ind) {
  // filename and fix_filename are captured synchronously by the caller
  try {
    const folderHandle = await save_path_handle.getDirectoryHandle(filename, { create: true });
    const fileHandle = await folderHandle.getFileHandle(fix_filename, { create: true });
    const writableStream = await fileHandle.createWritable();
    const writable = writableStream.getWriter();
    await writable.write(blob);
    await writable.close();
  } catch (err) {
    console.error('saveFiles error, falling back to download:', err)
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fix_filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } finally {
    for (let ind_mp3 = from_ind; ind_mp3 <= to_ind; ind_mp3++) {
      parts_book[ind_mp3].clear();
    }
  }
}

function save_merge(num_mp3, from_ind, to_ind, mp3_length) {
  if (!parts_book[from_ind].start_save) {
    parts_book[from_ind].start_save = true;

    // Capture filename synchronously before any async work
    const filename = parts_book[from_ind].my_filename;
    const isAll = parseInt(mergefiles.value) >= 100;
    const fix_filename = isAll ? filename + '.mp3' : filename + ' - Part ' + num_mp3 + '.mp3';

    const combinedUint8Array = new Uint8Array(mp3_length);
    let pos = 0;
    for (let ind_mp3 = from_ind; ind_mp3 <= to_ind; ind_mp3++) {
      combinedUint8Array.set(parts_book[ind_mp3].my_uint8Array, pos);
      pos += parts_book[ind_mp3].my_uint8Array.length;
    }
    
    var blob_mp3 = new Blob([combinedUint8Array.buffer]);
    
    if (save_path_handle ?? false) {
      saveFiles(filename, fix_filename, blob_mp3, from_ind, to_ind);
    } else {
      const url = window.URL.createObjectURL(blob_mp3);
      const link = document.createElement('a');
      link.href = url;
      link.download = fix_filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      for (let ind_mp3 = from_ind; ind_mp3 <= to_ind; ind_mp3++) {
        parts_book[ind_mp3].clear();
      }
    }
  }
}

function do_marge() {
  let count_mergefiles = parseInt(mergefiles.value);
  if (count_mergefiles >= 100) {
    count_mergefiles = book.all_sentences.length;
  }
  
  var books_map = [];
  var sav_ind = true;
  var last_ind = 0;
  var part_mp3_length = 0;
  var count_mp3 = 0;
  var num_mp3 = 1;
  let names_map = book.file_names.map(item => item[1]);

  for (let ind = 0; ind < book.all_sentences.length; ind++) {
    if (parts_book && ind < parts_book.length && parts_book[ind].mp3_saved === true) {
      if (sav_ind === true) {
        part_mp3_length += parts_book[ind].my_uint8Array.length;
      }
    } else {
      sav_ind = false;
      part_mp3_length = 0;
    }
  
    if (count_mp3 >= count_mergefiles - 1 || ind === book.all_sentences.length - 1 || names_map.includes(ind + 1)) {
      books_map.push([sav_ind, last_ind, ind, part_mp3_length, num_mp3]);
      sav_ind = true;
      last_ind = ind + 1;
      part_mp3_length = 0;
      count_mp3 = 0;
      if (names_map.includes(ind + 1)) {
        num_mp3 = 1;
      } else {
        num_mp3 += 1;
      }
    } else {
      count_mp3 += 1;
    }
  }
  
  for (let book_map of books_map) {
    if (book_map[0] === true && book_map[3] > 0) {
      save_merge(book_map[4], book_map[1], book_map[2], book_map[3]);
    }
  }
}

// ----------------------
// Directory picker & start
// ----------------------
async function selectDirectory() {
  if (window.showDirectoryPicker) {
    try {
      save_path_handle = await window.showDirectoryPicker();
      // Verify write access
      const fileHandle = await save_path_handle.getFileHandle('temp.txt', { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write('');
      await writable.close();
      await fileHandle.remove();
      get_audio();
    } catch (err) {
      console.log('err', err);
      save_path_handle = null;
      get_audio();
    }
  } else {
    console.log("showDirectoryPicker is not available, falling back.");
    save_path_handle = null;
    get_audio();
  }
}

const start = () => {
  save_settings();
  selectDirectory();
};

// ----------------------
// Settings persistence
// ----------------------
function save_settings() {
  localStorage.setItem('pointsSelect_value', pointsSelect.value);
  localStorage.setItem('pointsType_innerHTML', pointsType.innerHTML);
  localStorage.setItem('voice_value', voice.value);
  localStorage.setItem('rate_value', rate.value);
  localStorage.setItem('pitch_value', pitch.value);
  localStorage.setItem('max_threads_value', max_threads.value);
  localStorage.setItem('mergefiles_value', mergefiles.value);
  localStorage.setItem('rate_str_textContent', rate_str.textContent);
  localStorage.setItem('pitch_str_textContent', pitch_str.textContent);
  localStorage.setItem('max_threads_int_textContent', max_threads_int.textContent);
  localStorage.setItem('mergefiles_str_textContent', mergefiles_str.textContent);
  localStorage.setItem('statArea_style_display', statArea.style.display);
  localStorage.setItem('dopSettings_textContent', dopSettings.textContent);
}

function load_settings() {
  if (localStorage.getItem('pointsSelect_value')) { pointsSelect.value = localStorage.getItem('pointsSelect_value'); }
  if (localStorage.getItem('pointsType_innerHTML')) { pointsType.innerHTML = localStorage.getItem('pointsType_innerHTML'); }
  if (localStorage.getItem('voice_value')) { voice.value = localStorage.getItem('voice_value'); }
  if (localStorage.getItem('rate_value')) { rate.value = localStorage.getItem('rate_value'); }
  if (localStorage.getItem('pitch_value')) { pitch.value = localStorage.getItem('pitch_value'); }
  if (localStorage.getItem('max_threads_value')) { max_threads.value = localStorage.getItem('max_threads_value'); }
  if (localStorage.getItem('mergefiles_value')) { mergefiles.value = localStorage.getItem('mergefiles_value'); }
  if (localStorage.getItem('rate_str_textContent')) { rate_str.textContent = localStorage.getItem('rate_str_textContent'); }
  if (localStorage.getItem('pitch_str_textContent')) { pitch_str.textContent = localStorage.getItem('pitch_str_textContent'); }
  if (localStorage.getItem('max_threads_int_textContent')) { max_threads_int.textContent = localStorage.getItem('max_threads_int_textContent'); }
  if (localStorage.getItem('mergefiles_str_textContent')) { mergefiles_str.textContent = localStorage.getItem('mergefiles_str_textContent'); }
  if (localStorage.getItem('statArea_style_display')) { statArea.style.display = localStorage.getItem('statArea_style_display'); }
  if (localStorage.getItem('dopSettings_textContent')) { dopSettings.textContent = localStorage.getItem('dopSettings_textContent'); }
  threads_info = { count: parseInt(max_threads.value), stat: stat_str };
}

document.addEventListener("DOMContentLoaded", function(event) {
  textArea.style.display = 'block';
  statArea.style.display = 'block';
  load_settings();
  set_dopSettings();
});

// ----------------------
// UI controls
// ----------------------
fileButtonLex.addEventListener('click', () => { fileInputLex.click(); });
fileButton.addEventListener('click', () => { fileInput.click(); });

function change_dopSettings() {
  dopSettings.textContent = (dopSettings.textContent === "︿") ? "﹀" : "︿";
  set_dopSettings();
}

function set_dopSettings() {
  const display_dop = (textArea.style.display === 'block' || dopSettings.textContent === "︿") ? 'block' : 'none';
  document.querySelector('#div-pitch').style.display = display_dop;
  document.querySelector('#div-threads').style.display = display_dop;
  document.querySelector('#div-mergefiles').style.display = display_dop;
}

fileInputLex.addEventListener('change', (event) => {
  lexx = [];
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => { lexx = reader.result.split("\n"); };
    reader.readAsText(file);
    fileButtonLex.textContent = "Uploaded";
  } else {
    fileButtonLex.textContent = "Upload";
  }
});

fileInput.addEventListener('change', (event) => {
  run_work = false;
  book_loaded = false;
  statArea.value = "";
  
  if (book) { book.clear(); book = null; }
  
  if (event.target.files.length === 0) {
    fileButton.textContent = "Open";
    stat_info.textContent = "";
  }
  
  for (let file of event.target.files) {
    stat_info.textContent = "";
    stat_str.textContent = "0 / 0";
    
    if (file) {
      fileButton.textContent = "Processing...";
      const file_name_toLowerCase = file.name.toLowerCase();
      const baseName = file.name.slice(0, file.name.lastIndexOf("."));

      if (file_name_toLowerCase.endsWith('.pdf')) {
        const pdfReader = new FileReader();
        pdfReader.onload = () => {
          convertPdfToTxt(pdfReader.result).then(result => {
            book_loaded = true;
            get_text(baseName, result, true);
            fileButton.textContent = "Opened";
          });
        };
        pdfReader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          book_loaded = true;
          if (file_name_toLowerCase.endsWith('.txt')) {
            get_text(baseName, reader.result, true);
          } else if (file_name_toLowerCase.endsWith('.ini')) {
            get_text(baseName, reader.result, true);
          } else if (file_name_toLowerCase.endsWith('.fb2')) {
            get_text(baseName, convertFb2ToTxt(reader.result), true);
          } else if (file_name_toLowerCase.endsWith('.epub')) {
            convertEpubToTxt(file).then(result => get_text(baseName, result, true));
          } else if (file_name_toLowerCase.endsWith('.zip')) {
            convertZipToTxt(file);
          }
          fileButton.textContent = "Opened";
        };
        reader.readAsText(file);
      }
    } else {
      fileButton.textContent = "Open";
    }
  }
});