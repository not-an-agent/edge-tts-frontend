// texts_converter.js


// texts_converter.js
// This file is now an ES module.
// pdfjs-4.10.38-dist
import * as pdfjsLib from "./pdf.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = './assets/pdf.worker.mjs';

// FB2 to TXT converter
export function convertFb2ToTxt(fb2String) {
  const parser = new DOMParser();
  const fb2Doc = parser.parseFromString(fb2String.replace(/<p>/g, "\n<p>"), 'application/xml');
  let textContent = '';
  const bodyNode = fb2Doc.getElementsByTagName('body')[0];
  if (bodyNode) {
    const sectionNodes = bodyNode.getElementsByTagName('section');
    for (let i = 0; i < sectionNodes.length; i++) {
      const sectionNode = sectionNodes[i];
      const sectionText = sectionNode.textContent;
      textContent += sectionText + '\n\n';
    }
  }
  return textContent.trim();
}

// =======================
// New EPUB to TXT converter
// Uses container.xml & the OPF file to extract the reading order.
export async function convertEpubToTxt_New(epubBinary) {
  const zip = await JSZip.loadAsync(epubBinary);
  
  // Read container.xml to find the OPF file.
  const containerPath = "META-INF/container.xml";
  const containerFile = zip.file(containerPath);
  if (!containerFile) {
    throw new Error("container.xml not found in EPUB");
  }
  const containerXML = await containerFile.async("string");
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXML, "application/xml");
  const rootfileElem = containerDoc.querySelector("rootfile");
  if (!rootfileElem) {
    throw new Error("No <rootfile> element found in container.xml");
  }
  const opfPath = rootfileElem.getAttribute("full-path");
  if (!opfPath) {
    throw new Error("OPF path not found in container.xml");
  }
  console.log("Found OPF path:", opfPath);
  
  // Load the OPF file.
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error("OPF file not found: " + opfPath);
  }
  const opfXML = await opfFile.async("string");
  const opfDoc = parser.parseFromString(opfXML, "application/xml");
  
  // Build a manifest mapping (id -> href)
  const manifestItems = {};
  opfDoc.querySelectorAll("manifest > item").forEach(item => {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    manifestItems[id] = href;
  });
  
  // Build the spine (reading order) from the itemrefs.
  const spine = [];
  opfDoc.querySelectorAll("spine > itemref").forEach(itemref => {
    const idref = itemref.getAttribute("idref");
    if (manifestItems[idref]) {
      spine.push(manifestItems[idref]);
    }
  });
  
  // Determine the directory of the OPF file.
  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/")) : "";
  
  // Extract text from each chapter defined in the spine.
  const chapterPromises = spine.map(async chapterHref => {
    const fullPath = opfDir ? opfDir + "/" + chapterHref : chapterHref;
    const chapterFile = zip.file(fullPath);
    if (!chapterFile) {
      console.warn("Chapter file not found:", fullPath);
      return "";
    }
    const chapterHTML = await chapterFile.async("string");
    const doc = parser.parseFromString(chapterHTML, "text/html");
    return doc.body ? doc.body.textContent.trim() : "";
  });
  
  const chapters = await Promise.all(chapterPromises);
  const fullText = chapters.join("\n\n");
  return fullText.trim();
}

// =======================
// Old EPUB to TXT converter (using toc.ncx)
export async function convertEpubToTxt_Old(epubBinary) {
  const zip = await JSZip.loadAsync(epubBinary);
  const textFiles = [];
  let toc_path = "";
  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.name.endsWith('.ncx')) {
      toc_path = relativePath.slice(0, relativePath.lastIndexOf("toc.ncx"));
    }
  });
  
  const tocFile = zip.file(toc_path + 'toc.ncx');
  if (!tocFile) {
    throw new Error("toc.ncx not found in EPUB (old converter)");
  }
  const toc = await tocFile.async('text');
  const parser = new DOMParser();
  const tocDoc = parser.parseFromString(toc, 'application/xml');
  const navPoints = tocDoc.getElementsByTagName('navPoint');
  for (let i = 0; i < navPoints.length; i++) {
    const contentElem = navPoints[i].getElementsByTagName('content')[0];
    if (contentElem) {
      const src = toc_path + contentElem.getAttribute('src').split("#")[0];
      const file = zip.file(src);
      if (file) {
        textFiles.push(file);
      }
    }
  }
  let textContent = '';
  for (const file of textFiles) {
    const fileText = await file.async('text');
    const htmlDoc = parser.parseFromString(fileText, 'application/xhtml+xml');
    const bodyNode = htmlDoc.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'body')[0];
    if (bodyNode) {
      const textNodes = bodyNode.childNodes;
      for (let i = 0; i < textNodes.length; i++) {
        const node = textNodes[i];
        if (node.textContent.trim() !== '') {
          textContent += node.textContent.trim() + '\n';
        }
      }
      textContent += '\n\n';
    }
  }
  return textContent.trim();
}

// =======================
// Combined EPUB converter: Try the new method, then fallback to the old one.
export async function convertEpubToTxt(epubBinary) {
  try {
    return await convertEpubToTxt_New(epubBinary);
  } catch (err) {
    console.warn("New EPUB converter failed, using fallback. Error:", err);
    return await convertEpubToTxt_Old(epubBinary);
  }
}

// ZIP to TXT converter remains unchanged.
export function convertZipToTxt(zipFile) {
  JSZip.loadAsync(zipFile)
    .then(function (zip) {
      zip.forEach(function (relativePath, file) {
        const file_name_toLowerCase = file.name.toLowerCase();
        if (file_name_toLowerCase.endsWith('.txt')) {
          file.async('text').then(result => get_text(file.name.slice(0, file.name.lastIndexOf(".")), result, true));
        } else if (file_name_toLowerCase.endsWith('.fb2')) {
          file.async('text').then(result => get_text(file.name.slice(0, file.name.lastIndexOf(".")), convertFb2ToTxt(result), true));
        } else if (file_name_toLowerCase.endsWith('.epub')) {
          file.async('ArrayBuffer').then(result => unzip_epub(file, result));
        }	
      });
    }, function (e) {
      console.log(e.message);
    });
}

function unzip_epub(file, file_text) {				
  const blob = new Blob([file_text], { type: 'application/epub+zip' });
  const epub_file = new File([blob], 'my_epub_file_name.epub', { type: 'application/epub+zip' });					
  convertEpubToTxt(epub_file).then(result => get_text(file.name.slice(0, file.name.lastIndexOf(".")), result, true));
}

// PDF to TXT converter remains unchanged.
export async function convertPdfToTxt(pdfBinary) {
  const pdf = await pdfjsLib.getDocument({ data: pdfBinary }).promise;
  let textContent = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    let page = await pdf.getPage(pageNum);
    let content = await page.getTextContent();
    let strings = content.items.map(item => item.str);
    textContent += strings.join(' ') + '\n\n';
  }
  return textContent.trim();
}

// Expose functions globally so non-module scripts can call them.
window.convertPdfToTxt = convertPdfToTxt;
window.convertEpubToTxt = convertEpubToTxt;
