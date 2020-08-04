import React from 'react';
import Toggle from 'react-toggle';
import { t } from 'ttag';

import { IMAGE_FORMATS } from './utils/IMAGE_FORMATS';

export default class BasicForm extends React.Component {
  OVERLAY_TITLE = t`The map's overlay layers (place labels, streets and political boundaries) will be added to the image.`;
  CAPTIONS_TITLE = t`Exported image(s) will include datasource and date, zoom scale and branding`;
  DESCRIPTION_TITLE = t`Add a short description to the exported image`;

  render() {
    const {
      showCaptions,
      updateFormData,
      addMapOverlays,
      showLegend,
      userDescription,
      hasLegendData,
      addingMapOverlaysPossible,
      onErrorMessage,
      imageFormat,
    } = this.props;
    return (
      <div>
        <div className="formField">
          <label title={this.CAPTIONS_TITLE}>
            {t`Show captions`}
            <i
              className="fa fa-question-circle"
              onClick={() => {
                onErrorMessage(this.CAPTIONS_TITLE);
              }}
            />
          </label>
          <div className="form-input">
            <Toggle
              checked={showCaptions}
              icons={false}
              onChange={() => updateFormData('showCaptions', !showCaptions)}
            />
          </div>
        </div>
        {addingMapOverlaysPossible && (
          <div className="formField">
            <label title={this.OVERLAY_TITLE}>
              {t`Add map overlays`}
              <i
                className="fa fa-question-circle"
                onClick={() => {
                  onErrorMessage(this.OVERLAY_TITLE);
                }}
              />
            </label>
            <div className="form-input">
              <Toggle
                checked={addMapOverlays}
                icons={false}
                onChange={() => updateFormData('addMapOverlays', !addMapOverlays)}
              />
            </div>
          </div>
        )}
        {hasLegendData && (
          <div className="formField">
            <label title={t`Show legend`}>
              {t`Show legend`}
              <i
                className="fa fa-question-circle"
                onClick={() => {
                  onErrorMessage(t`Exported image will include legend`);
                }}
              />
            </label>
            <div className="form-input">
              <Toggle
                checked={showLegend}
                icons={false}
                onChange={() => updateFormData('showLegend', !showLegend)}
              />
            </div>
          </div>
        )}
        {showCaptions && (
          <div className="formField">
            <label title={this.DESCRIPTION_TITLE}>
              {t`Description`}
              <i
                className="fa fa-question-circle"
                onClick={() => {
                  onErrorMessage(this.DESCRIPTION_TITLE);
                }}
              />
            </label>
            <div className="form-input">
              <input
                className="full-width"
                value={userDescription}
                onChange={ev => updateFormData('userDescription', ev.target.value)}
                maxLength="64"
              />
            </div>
          </div>
        )}
        <div className="formField">
          <label>{t`Image format:`}</label>
          <div className="form-input">
            <select
              className="dropdown"
              value={imageFormat}
              onChange={e => updateFormData('imageFormat', e.target.value)}
            >
              {IMAGE_FORMATS.filter(imf => ['jpg', 'png'].includes(imf.ext)).map(obj => (
                <option key={obj.text} data-ext={obj.ext} value={obj.value}>
                  {obj.text}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  }
}
