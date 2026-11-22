# SIM Expense Report

A simple web app for building travel expense reports. Upload your receipts, confirm the details, and download a clean PDF report plus a zip of your receipts to send to your admin for reimbursement.

Everything runs in your browser. Receipts are never uploaded anywhere, and nothing is saved once you close the tab.

## How to use it

The app walks you through the report one step at a time.

1. **Trip details.** Enter your name, the client you were working with, and the trip start and end dates.
2. **Company card expenses.** For each section (Accommodations, Airfare, Transportation, Fuel, Miscellaneous), drop in your receipts or click to choose files. You can add several at once. If you have nothing for a section, click **Nothing to add, skip**.
3. **Personal expenses.** Add anything you paid for yourself that needs to be repaid, and pick a category for each one.
4. **Per diem and mileage.** Enter the number of per diem days you are claiming. Answer whether you need mileage, and if so, how many miles you drove.
5. **Report.** Review the report, then click **Download PDF** and **Download receipts**.

### Checking what the app read

For each receipt, the app tries to fill in the date, vendor and amount for you. Each one gets a status:

- **Read:** the app found everything. Give it a quick look anyway.
- **Check:** the app found values but isn't sure about some of them. The fields to check are highlighted.
- **Enter manually:** the app couldn't read the receipt. Fill in the highlighted fields yourself.

You can edit any field at any time. Click a receipt's thumbnail to see it full size.

### Adding a line without a receipt

Click **+ Add manually** to add a line with no file, like a cash tip or a lost receipt. The app will ask you to confirm before moving on, and the line will be marked with an asterisk on the report. If you find the receipt later, click **Attach a receipt** on that line.

## Tips for better results

- **Rename your files before uploading.** The app uses the file name as the vendor, so `Hilton Garden Inn.pdf` will come through as "Hilton Garden Inn". Generic phone names like `IMG_4471.jpg` are ignored.
- **PDFs read best.** Hotel folios and airline receipts are usually read correctly.
- **Photos work best when clear.** Take them flat, in good light, with the whole receipt in frame. Crumpled or faded receipts may need manual entry.
- **iPhone photos (HEIC)** may not open in every browser. If one fails, export it as a JPG first.
- **Hotel parking** that appears on the folio stays with the hotel. Parking paid separately goes in Miscellaneous.

## What you get

**The PDF report** includes:

- Your name, client and trip dates
- **Company Card Expenses**, sorted by purchase date, with a subtotal
- **Personal Expenses**, sorted by purchase date, followed by per diem and mileage, with a subtotal
- **Grand Total to Client** (company card plus personal expenses)
- **Expenses to be Reimbursed** (personal expenses only)

**The receipts zip** holds every file you uploaded, with its original name.

## Settings

Click **Settings** in the top right to change the per diem rate (per day) and the mileage rate (per mile). These are saved in your browser only, so they stay the same next time you use the app on that computer.

To change the default rates for everyone, edit the `defaults` in `js/config.js`.

**Optional:** If an `assets/rates.json` file exists, the app uses it as the official rates and asks anyone with different saved rates whether they want to switch. Change the `updated` date in that file whenever you change the rates, or people won't be asked again.

```json
{
  "updated": "2026-11-22",
  "perDiemRate": 68,
  "mileageRate": 0.535
}
```

## Logo

The report and the top bar use `assets/sim-logo.png`. To use a different file, change `logoSrc` in `js/config.js`. If the file is missing, the report just leaves the logo out.

## Running the app

The app has to be opened from a web address, not by double-clicking `index.html`. Otherwise the receipt reading won't work.

- **GitHub Pages:** Push the folder to the repo and open the Pages URL.
- **On your own computer:** Open a terminal in this folder and run `python3 -m http.server 8000`, then go to `http://localhost:8000`.

The first photo you upload may take a few extra seconds while the reader loads.

## Folder structure

```
index.html              The app page
assets/                 Logo (and optional rates.json)
css/styles.css          Styling
js/config.js            Default rates, logo path, section names
js/app.js               The step-by-step flow, settings and downloads
js/extract.js           Reads receipts and finds the date, vendor and amount
js/report.js            Totals, the on-screen preview, the PDF and the zip
js/vendor/              Third-party libraries, stored locally
```

## Limitations

- Built for laptop and desktop. A mobile version is planned.
- Progress isn't saved. Closing or refreshing the tab clears the report, so finish it in one sitting.
- Per diem is counted in full days only.

## Libraries

Included in `js/vendor/` so the app needs no outside services:

- [PDF.js](https://mozilla.github.io/pdf.js/) for reading PDFs
- [Tesseract.js](https://tesseract.projectnaptha.com/) for reading photos
- [jsPDF](https://github.com/parallax/jsPDF) and [jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable) for building the report
- [JSZip](https://stuk.github.io/jszip/) for the receipts zip
