const fs = require('fs');
const path = require('path');

// Directories
const inputDirectory = path.join(__dirname, 'downloaded');
const outputDirectory = path.join(__dirname, 'output');

// Ensure the output directory exists
if (!fs.existsSync(outputDirectory)) {
  fs.mkdirSync(outputDirectory);
}

// Function to escape quotes and handle line breaks in CSV
function escapeCSVValue(value) {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    value = value.replace(/"/g, '""');
    value = `"${value}"`;
  }
  return value;
}

// Function to read JSON files, process data, and generate CSV
function processJSONFiles(directory) {
  let summaryContent = 'Index,EID,Title,Keyword,Abstract,Remark\n';

  // Read all files in the directory
  fs.readdir(directory, (err, files) => {
    if (err) {
      return console.log('Unable to scan directory: ' + err);
    }

    // Process each JSON file
    files.forEach((file) => {
      if (file.endsWith('_doc-details.json')) {
        const filePath = path.join(directory, file);
        const [fileIndex, eid] = file.split('_').slice(0, 2);
        const rawData = fs.readFileSync(filePath);
        const data = JSON.parse(rawData);

        // Extract and handle title
        let title = '';
        let titleRemark = '';
        if (data.titles) {
          if (data.titles.length > 1) {
            title = data.titles.join('; ');
            titleRemark = 'Title has more than one element';
          } else {
            title = data.titles[0] || '';
            if (!data.titles[0]) {
              titleRemark = 'Title is null';
            }
          }
        } else {
          titleRemark = 'Title is null';
        }

        // Extract and handle abstract
        let abstract = '';
        let abstractRemark = '';
        if (data.abstract) {
          if (data.abstract.length > 1) {
            abstract = data.abstract.join(' ');
            abstractRemark = 'Abstract has more than one element';
          } else {
            abstract = data.abstract[0] || '';
            if (!data.abstract[0]) {
              abstractRemark = 'Abstract is null';
            }
          }
        } else {
          abstractRemark = 'Abstract is null';
        }

        // Flatten and extract indexed keywords
        let indexedKeywords = [];
        let keywordRemark = '';
        for (const key in data.indexedKeywords) {
          if (data.indexedKeywords.hasOwnProperty(key)) {
            indexedKeywords = indexedKeywords.concat(data.indexedKeywords[key]);
          }
        }
        if (indexedKeywords.length === 0) {
          keywordRemark = 'Keywords are null';
        }
        indexedKeywords = indexedKeywords.join(', ');

        // Combine remarks
        let remarks = [];
        if (titleRemark) remarks.push(titleRemark);
        if (abstractRemark) remarks.push(abstractRemark);
        if (keywordRemark) remarks.push(keywordRemark);
        const remark = escapeCSVValue(remarks.join(', '));

        // Create CSV content for individual file
        const csvContent = `Index,EID,Title,Keyword,Abstract,Remark\n${escapeCSVValue(fileIndex)},${escapeCSVValue(eid)},${escapeCSVValue(title)},${escapeCSVValue(indexedKeywords)},${escapeCSVValue(abstract)},${remark}`;

        // Output CSV file name
        const csvFileName = `${fileIndex}_${eid}_tka.csv`;
        const csvFilePath = path.join(outputDirectory, csvFileName);

        // Save CSV content to individual file
        fs.writeFileSync(csvFilePath, csvContent, 'utf8');
        console.log('CSV file has been created:', csvFilePath);

        // Append to summary content
        summaryContent += `${escapeCSVValue(fileIndex)},${escapeCSVValue(eid)},${escapeCSVValue(title)},${escapeCSVValue(indexedKeywords)},${escapeCSVValue(abstract)},${remark}\n`;
      }
    });

    // Save summary CSV content to file
    const summaryFilePath = path.join(outputDirectory, '_summary.csv');
    fs.writeFileSync(summaryFilePath, summaryContent, 'utf8');
    console.log('Summary CSV file has been created:', summaryFilePath);
  });
}

// Execute the function
processJSONFiles(inputDirectory);
