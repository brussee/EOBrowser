import React, { Component } from 'react';
import Measure from './Measure/Measure';
import AOI from './AOI/AOI';
import POI from './POI/POI';
import LeafletPMLanguage from './LeafletPMLanguage';
import ImageDownloadBtn from './ImgDownload/ImageDownloadBtn';
import TimelapseButton from './Timelapse/TimelapseButton';
import TerrainViewerButton from '../TerrainViewer/TerrainViewerButton';
import { withLeaflet } from 'react-leaflet';

class Controls extends Component {
  render() {
    return (
      <div className="controlsWrapper">
        <LeafletPMLanguage map={this.props.leaflet.map} />
        <AOI map={this.props.leaflet.map} locale={this.props.selectedLanguage} />
        <POI map={this.props.leaflet.map} locale={this.props.selectedLanguage} />
        <Measure map={this.props.leaflet.map} locale={this.props.selectedLanguage} />
        <ImageDownloadBtn locale={this.props.selectedLanguage} />
        <TimelapseButton locale={this.props.selectedLanguage} />
        <TerrainViewerButton />
      </div>
    );
  }
}

export default withLeaflet(Controls);
