/* App defaults. Edit these to change the defaults for everyone who uses the app.
   Rates changed in the Settings panel are saved only in that person's browser. */
window.APP_CONFIG = {
  defaults: {
    perDiemRate: 68,      // dollars per full day
    mileageRate: 0.535    // dollars per mile
  },

  // Put the SIM logo here (PNG or JPG). If the file is missing, the report just leaves it out.
  logoSrc: 'assets/sim-logo.png',

  // Company card sections, in the order the app asks for them
  categories: [
    { key: 'Accommodations', label: 'Accommodations', short: 'Hotels',
      help: 'Hotel folios and receipts. If parking is on the folio, leave it here as part of the hotel total.' },
    { key: 'Airfare', label: 'Airfare', short: 'Airfare',
      help: 'Airline receipts and booking confirmations.' },
    { key: 'Transportation', label: 'Transportation', short: 'Transportation',
      help: 'Rental cars, rideshare, taxis, trains.' },
    { key: 'Fuel', label: 'Fuel', short: 'Fuel',
      help: 'Gas and fuel receipts.' },
    { key: 'Miscellaneous', label: 'Miscellaneous', short: 'Misc',
      help: 'Parking (when it is not on a hotel folio), tolls, and anything else.' }
  ]
};
