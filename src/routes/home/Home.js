/**
 * React Starter Kit (https://www.reactstarterkit.com/)
 *
 * Copyright © 2014-present Kriasoft, LLC. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.txt file in the root directory of this source tree.
 */

import promisify from 'util.promisify';
import React from 'react';
import withStyles from 'isomorphic-style-loader/lib/withStyles';
import FileReaderInput from 'react-file-reader-input';
import toBuffer from 'blob-to-buffer';
import { ExifImage } from 'exif';
import axios from 'axios';
import promisedLocation from 'promised-location';
import { compose, withProps } from 'recompose';
import {
  withScriptjs,
  withGoogleMap,
  GoogleMap,
  Marker,
} from 'react-google-maps';
import persist from 'react-localstorage-hoc';

import s from './Home.css';

const colorTaxiInfos = {
  Yellow: {
    regex: RegExp('^\\d[A-Za-z]\\d\\d$'),
    placeholder: '1E23',
  },
  Green: {
    regex: RegExp('^[A-Za-z]{2}\\d{3}$'),
    placeholder: 'AA123',
  },
  Black: {
    regex: RegExp('(^T\\d{6}C$)|(^\\d{6}$)'),
    placeholder: 'T646345C',
  },
};
const colorTaxiNames = Object.keys(colorTaxiInfos);
const typeofuserValues = ['Cyclist', 'Walker', 'Passenger'];
const typeofcomplaintValues = [
  'Blocked the bike lane',
  'Blocked the crosswalk',
  'Honked horn (no emergency)',
  'Failed to yield to pedestrian',
  'Drove aggressively',
  'Was on a cell phone while driving',
  'Refused to pick me up',
  'Was courteous, kind or polite',
  'Went above and beyond to help',
];

class Home extends React.Component {
  state = {
    colorTaxi: colorTaxiNames[0],
    typeofuser: typeofuserValues[0],
    typeofcomplaint: typeofcomplaintValues[0],
    reportDescription: '',
    can_be_shared_publicly: false,
    lat: 40.7128,
    lng: -74.006,
    // TODO keep track of image data instead of url, maybe `imageBytes`?
    // TODO also consider using IndexedDB (via e.g. localForage) to store File/Blob objects directly
    imageUrls: [],
  };

  componentDidMount() {
    this.setCreateDate({ millisecondsSinceEpoch: Date.now() });
    promisedLocation().then(({ coords: { latitude: lat, longitude: lng } }) => {
      this.setLatLng({ lat, lng });
    });
  }

  setLatLng = ({ lat, lng }) => {
    this.setState({ lat, lng });
  };

  setCreateDate = ({ millisecondsSinceEpoch }) => {
    // Adjust date to local time
    // https://stackoverflow.com/questions/674721/how-do-i-subtract-minutes-from-a-date-in-javascript
    const MS_PER_MINUTE = 60000;
    const offset = new Date().getTimezoneOffset();
    const CreateDateJsLocal = new Date(
      millisecondsSinceEpoch - offset * MS_PER_MINUTE,
    );

    this.setState({
      // TODO make sure this is submitted as UTC: https://reportedcab.slack.com/messages/C852Q265V/p1522269753000718
      CreateDate: CreateDateJsLocal.toISOString().replace(/\..*/g, ''),
    });
  };

  setLicensePlate = ({ plate }) => {
    this.setState({ plate });

    for (const colorTaxi of colorTaxiNames) {
      if (plate.match(colorTaxiInfos[colorTaxi].regex)) {
        this.setState({ colorTaxi });
      }
    }
  };

  // adapted from https://github.com/ngokevin/react-file-reader-input/tree/f970257f271b8c3bba9d529ffdbfa4f4731e0799#usage
  handleChange = async (_, results) => {
    const images = await Promise.all(
      results.map(async result => {
        const [, file] = result;
        try {
          const imageUrl = window.URL.createObjectURL(file);
          const image = await promisify(toBuffer)(file); // eslint-disable-line no-await-in-loop
          return { imageUrl, image };
        } catch (err) {
          console.error(`Error: ${err.message}`);
          return {};
        }
      }),
    );

    this.setState({ imageUrls: images.map(({ imageUrl }) => imageUrl) });

    for (const { image } of images) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await Promise.all([
          this.extractPlate({ image }),
          promisify(ExifImage)({ image }).then(exifData =>
            Promise.all([
              console.info(JSON.stringify(exifData, null, 2)),
              this.extractLocation({ exifData }),
              this.extractDate({ exifData }),
            ]),
          ),
        ]);
      } catch (err) {
        console.error(`Error: ${err.message}`);
      }
    }
  };

  handleInputChange = event => {
    const { target } = event;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    const { name } = target;

    this.setState({
      [name]: value,
    });
  };

  // adapted from https://github.com/openalpr/cloudapi/tree/8141c1ba57f03df4f53430c6e5e389b39714d0e0/javascript#getting-started
  extractPlate = async ({ image }) => {
    const imageBytes = image.toString('base64'); // {String} The image file that you wish to analyze encoded in base64

    const country = 'us'; // {String} Defines the training data used by OpenALPR. \"us\" analyzes North-American style plates. \"eu\" analyzes European-style plates. This field is required if using the \"plate\" task You may use multiple datasets by using commas between the country codes. For example, 'au,auwide' would analyze using both the Australian plate styles. A full list of supported country codes can be found here https://github.com/openalpr/openalpr/tree/master/runtime_data/config

    const opts = {
      recognizeVehicle: 0, // {Integer} If set to 1, the vehicle will also be recognized in the image This requires an additional credit per request
      state: 'ny', // {String} Corresponds to a US state or EU country code used by OpenALPR pattern recognition. For example, using \"md\" matches US plates against the Maryland plate patterns. Using \"fr\" matches European plates against the French plate patterns.
      returnImage: 0, // {Integer} If set to 1, the image you uploaded will be encoded in base64 and sent back along with the response
      topn: 10, // {Integer} The number of results you would like to be returned for plate candidates and vehicle classifications
      prewarp: '', // {String} Prewarp configuration is used to calibrate the analyses for the angle of a particular camera. More information is available here http://doc.openalpr.com/accuracy_improvements.html#calibration
    };

    const { data } = await axios.post('/openalpr', {
      imageBytes,
      country,
      opts,
    });
    console.info(
      `API called successfully. Returned data: ${JSON.stringify(
        data,
        null,
        2,
      )}`,
    );
    const { plate } = data.results[0];
    this.setLicensePlate({ plate });
  };

  extractDate = ({ exifData }) => {
    const { exif: { CreateDate } } = exifData;
    const millisecondsSinceEpoch = new Date(
      CreateDate.replace(':', '/').replace(':', '/'),
    ).getTime();

    this.setCreateDate({ millisecondsSinceEpoch });
  };

  extractLocation = ({ exifData }) => {
    const { gps } = exifData;
    console.info(JSON.stringify(gps, null, 2)); // Do something with your data!
    const { lat, lng } = this.coordsFromExifGps({ gps });
    console.info(JSON.stringify({ lat, lng }, null, 2));
    this.setLatLng({ lat, lng });
  };

  // adapted from http://danielhindrikes.se/web/get-coordinates-from-photo-with-javascript/
  coordsFromExifGps = ({ gps }) => {
    let lat = gps.GPSLatitude;
    let lng = gps.GPSLongitude;

    // Convert coordinates to WGS84 decimal
    const latRef = gps.GPSLatitudeRef || 'N';
    const lngRef = gps.GPSLongitudeRef || 'W';
    lat = (lat[0] + lat[1] / 60 + lat[2] / 3600) * (latRef === 'N' ? 1 : -1);
    lng = (lng[0] + lng[1] / 60 + lng[2] / 3600) * (lngRef === 'W' ? -1 : 1);

    return { lat, lng };
  };

  render() {
    return (
      <div className={s.root}>
        <div className={s.container}>
          <br />

          {/*
            TODO User Profile Info
            https://github.com/jeffrono/Reported-Android/blob/f92949014678f8847ef83a9e5746a9d97d4db87f/app/src/main/java/cab/reported/nyc/session/SessionManagerImpl.kt#L152-L238
          */}

          <FileReaderInput
            accept="image/*"
            multiple
            as="buffer"
            onChange={this.handleChange}
          >
            <button>Select/Take a picture</button>
          </FileReaderInput>

          {this.state.imageUrls.map(imageUrl => (
            <div key={imageUrl}>
              <a target="_blank" href={imageUrl}>
                {imageUrl}
              </a>

              <button
                onClick={() => {
                  this.setState({
                    imageUrls: this.state.imageUrls.filter(
                      url => url !== imageUrl,
                    ),
                  });
                }}
              >
                Remove this image
              </button>
            </div>
          ))}

          <label>
            Cab Color:{' '}
            <select
              value={this.state.colorTaxi}
              name="colorTaxi"
              onChange={this.handleInputChange}
            >
              {colorTaxiNames.map(colorTaxi => (
                <option key={colorTaxi} value={colorTaxi}>
                  {colorTaxi}
                </option>
              ))}
            </select>
          </label>

          <label>
            License/Medallion:{' '}
            <input
              type="text"
              value={this.state.plate}
              placeholder={colorTaxiInfos[this.state.colorTaxi].placeholder}
              onChange={event => {
                this.setLicensePlate({ plate: event.target.value });
              }}
            />
          </label>

          <label>
            I was:{' '}
            <select
              value={this.state.typeofuser}
              name="typeofuser"
              onChange={this.handleInputChange}
            >
              {typeofuserValues.map(typeofuser => (
                <option key={typeofuser} value={typeofuser}>
                  {typeofuser}
                </option>
              ))}
            </select>
          </label>

          <label>
            Type:{' '}
            <select
              value={this.state.typeofcomplaint}
              name="typeofcomplaint"
              onChange={this.handleInputChange}
            >
              {typeofcomplaintValues.map(typeofcomplaint => (
                <option key={typeofcomplaint} value={typeofcomplaint}>
                  {typeofcomplaint}
                </option>
              ))}
            </select>
          </label>

          <details>
            <summary>
              Where:
              <br />
              {this.state.lat},
              <br />
              {this.state.lng}
            </summary>
            <MyMapComponent
              key="map"
              position={{
                lat: this.state.lat,
                lng: this.state.lng,
              }}
              onRef={mapRef => {
                this.mapRef = mapRef;
              }}
              onCenterChanged={() => {
                const lat = this.mapRef.getCenter().lat();
                const lng = this.mapRef.getCenter().lng();
                this.setLatLng({ lat, lng });
              }}
            />
          </details>
          {/* TODO reverse geocode, allow edits */}

          <label>
            When:{' '}
            <input
              type="datetime-local"
              value={this.state.CreateDate}
              name="CreateDate"
              onChange={this.handleInputChange}
            />
          </label>

          <label>
            Description:{' '}
            <textarea
              value={this.state.reportDescription}
              name="reportDescription"
              onChange={this.handleInputChange}
            />
          </label>

          <label>
            <input
              type="checkbox"
              checked={this.state.can_be_shared_publicly}
              name="can_be_shared_publicly"
              onChange={this.handleInputChange}
            />{' '}
            Allow the photo, description, category, and location to be publicly
            displayed
          </label>

          {/*
          <p>TODO submit button</p>
          */}
        </div>
      </div>
    );
  }
}

const GOOGLE_MAPS_API_KEY = 'AIzaSyDlwm2ykA0ohTXeVepQYvkcmdjz2M2CKEI';
const MyMapComponent = compose(
  withProps({
    googleMapURL: `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&v=3.exp&libraries=geometry,drawing,places`,
    loadingElement: <div style={{ height: `100%` }} />,
    containerElement: <div style={{ height: `400px` }} />,
    mapElement: <div style={{ height: `100%` }} />,
  }),
  withScriptjs,
  withGoogleMap,
)(props => {
  const { position, onRef, onCenterChanged } = props;

  return (
    <GoogleMap
      defaultZoom={16}
      center={position}
      ref={onRef}
      onCenterChanged={onCenterChanged}
      options={{ gestureHandling: 'greedy' }}
    >
      <Marker position={position} />
    </GoogleMap>
  );
});

export default withStyles(s)(persist(Home));
