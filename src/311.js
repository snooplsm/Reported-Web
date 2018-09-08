/* eslint-disable camelcase */
/* eslint-disable no-shadow */

// headless puppeteer submission proof-of-concept
// from https://reportedcab.slack.com/files/U9N03CAEM/FCB3SMUR1/headless_puppeteer_submission_proof-of-concept.js

const puppeteer = require('puppeteer');
const strftime = require('strftime');

const boroughDropdownValues = {
  BRONX: '1-4X9-313',
  BROOKLYN: '1-4X9-314',
  MANHATTAN: '1-4X9-316',
  QUEENS: '1-4X9-315',
  'STATEN ISLAND': '1-4X9-318',
};

// ported from https://github.com/jeffrono/Reported/blob/8cdc7efe6532aa0fd8b83ef0bcba083a14bcf52b/v2/task_311_illegal_parking_submission.rb
async function submit_311_illegal_parking_report({
  Username, // email
  typeofcomplaint,
  medallionNo,
  submission_timestamp,
  formal_description,
  photo_url_0,
  // photo_url_1,
  // photo_url_2,
  firstBoroughName,
  houseNumberIn,
  streetName1In,
  latitude,
  longitude,
  FirstName,
  LastName,
  Phone,
  Borough,
  Building,
  StreetName,
  Apt,
}) {
  const submission_date = new Date(submission_timestamp);

  const browser = await puppeteer.launch({ headless: false }); // TODO change to true
  const page = await browser.newPage();
  page.setViewport({
    width: 1000,
    height: 1000,
  });
  await page.goto(
    'http://www1.nyc.gov/apps/311universalintake/form.htm?serviceName=NYPD+Parking',
  );

  await page.evaluate(async () => {
    document.querySelector('#nextPage').click();
  });

  await page.waitForNavigation();
  await new Promise(resolve => setTimeout(resolve, 5000));

  const humanDate = strftime('%a, %b %d at %I:%M %p', submission_date);
  const formDate = strftime('%D %r', submission_date);
  await page.evaluate(
    async ({
      typeofcomplaint,
      humanDate,
      formDate,
      formal_description,
      medallionNo,
      photo_url_0,
      // photo_url_1,
      // photo_url_2,
    }) => {
      // select from list  (blocked bike lane, others)
      if (typeofcomplaint === 'Parked illegally') {
        document.querySelector('#descriptor1').value = '1-6VN-6'; // (Posted Parking Sign Violation)
      } else {
        document.querySelector('#descriptor1').value = '1-KZ5-3'; // (Blocked Bike Lane)
      }

      // fill in description of complaint

      // identify the timestamp at top of description
      let description = `THIS OCCURRED ON ${humanDate} - `;

      // take first 400 characters
      description += formal_description.slice(0, 400);
      // .split.first().join(' ')
      description += `  License: ${medallionNo}. `;

      if (photo_url_0) {
        description += `Photo 1: ${photo_url_0}  `;
      }

      // if (photo_url_1) {
      //   description += `Photo 2: ${photo_url_1}  `
      // }

      // if (photo_url_2) {
      //   description += `Photo 3: ${photo_url_2}  `
      // }

      document.querySelector('#complaintDetails').value = description;

      // set date time
      document.querySelector('#dateTimeOfIncident').value = formDate;

      document.querySelector('#nextPage').click();
    },
    {
      typeofcomplaint,
      humanDate,
      formDate,
      formal_description,
      medallionNo,
      photo_url_0,
      // photo_url_1,
      // photo_url_2,
    },
  );

  await page.waitForNavigation();
  await new Promise(resolve => setTimeout(resolve, 5000));

  await page.evaluate(
    async ({
      firstBoroughName,
      houseNumberIn,
      streetName1In,
      latitude,
      longitude,
      boroughDropdownValues,
    }) => {
      // set location
      document.querySelector('#locationType').value = '1-6VO-1630'; // (Street/Sidewalk)

      document.querySelector('#incidentBorough6').value =
        boroughDropdownValues[firstBoroughName.toUpperCase()];

      document.querySelector('#incidentAddressNumber').value = houseNumberIn;
      document.querySelector('#incidentStreetName').value = streetName1In;
      document.querySelector(
        '#locationDetails',
      ).value = `Exact lat/lng of incident (the address submitted is approximate): ${latitude}, ${longitude}.`;

      // click next
      document.querySelector('#nextPage').click();
    },
    {
      firstBoroughName,
      houseNumberIn,
      streetName1In,
      latitude,
      longitude,
      boroughDropdownValues,
    },
  );

  await page.waitForNavigation();
  await new Promise(resolve => setTimeout(resolve, 5000));

  await page.evaluate(
    async ({
      Username,
      FirstName,
      LastName,
      Phone,
      Borough,
      Building,
      StreetName,
      Apt,
      boroughDropdownValues,
    }) => {
      document.querySelector('#contactEmailAddress').value = Username;
      document.querySelector('#contactFirstName').value = FirstName;
      document.querySelector('#contactLastName').value = LastName;
      document.querySelector('#contactDaytimePhone').value = Phone;

      document.querySelector('#contactBorough').value =
        boroughDropdownValues[Borough.toUpperCase()];

      document.querySelector('#contactAddressNumber').value = Building;
      document.querySelector('#contactStreetName').value = StreetName;
      document.querySelector('#contactApartment').value = Apt;

      document.querySelector('#nextPage').click();
    },
    {
      Username,
      FirstName,
      LastName,
      Phone,
      Borough,
      Building,
      StreetName,
      Apt,
      boroughDropdownValues,
    },
  );

  await page.waitForNavigation();
  await new Promise(resolve => setTimeout(resolve, 5000));

  // XXX the following code submits the form!
  // /*
  await page.evaluate(async () => {
    document.querySelector('#CONFIRMATION').click();
  });

  // console.log('submitted, waiting for result');
  await page.waitForFunction(() =>
    document
      .querySelector('.green_bold')
      .innerText.includes('Your Service Request was submitted'),
  );

  // make sure to dump the html from the submitted page so you can regex it
  // https://reportedcab.slack.com/archives/C85007FUY/p1534693301000100
  // https://github.com/GoogleChrome/puppeteer/issues/331#issuecomment-323018788
  const bodyHtml = await page.evaluate(() => document.body.innerHTML);
  // console.log({ bodyHtml });

  let serviceRequestNumber = bodyHtml.match(/\d-\d-\d{10}/);
  serviceRequestNumber =
    (serviceRequestNumber && serviceRequestNumber[0]) || 'Emailed by 311';

  return { serviceRequestNumber };
  // */
}

module.exports = {
  submit_311_illegal_parking_report,
};
