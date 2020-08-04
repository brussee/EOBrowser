import React, { Component } from 'react';
import { connect } from 'react-redux';
import { EOBTimelapsePanelButton } from '../../junk/EOBTimelapsePanelButton/EOBTimelapsePanelButton';
import 'rodal/lib/rodal.css';

import store, { modalSlice, notificationSlice } from '../../store';
import { getDataSourceHandler } from '../../Tools/SearchPanel/dataSourceHandlers/dataSourceHandlers';
import { ModalId } from '../../Modals/Consts';

class TimelapseButton extends Component {
  openTimelapse = () => {
    store.dispatch(modalSlice.actions.addModal({ modal: ModalId.TIMELAPSE }));
  };

  generateSelectedResult = () => {
    const { dataSourcesInitialized, layerId, customSelected, datasetId, visualizationUrl } = this.props;
    const isVisualizationSet =
      dataSourcesInitialized && (layerId || customSelected) && datasetId && visualizationUrl;
    let selectedResult;

    if (isVisualizationSet) {
      selectedResult = { name: datasetId };
      const dsh = getDataSourceHandler(datasetId);
      if (dsh.supportsTimelapse()) {
        selectedResult.getDates = true;
        selectedResult.baseUrls = { WMS: true };
      }
    }
    return selectedResult;
  };

  render() {
    return (
      <div className="timelapse-wrapper">
        <EOBTimelapsePanelButton
          selectedResult={this.generateSelectedResult()}
          isLoggedIn={!!this.props.user.userdata}
          openTimelapsePanel={this.openTimelapse}
          onErrorMessage={msg => store.dispatch(notificationSlice.actions.displayError(msg))}
        />
      </div>
    );
  }
}

const mapStoreToProps = store => ({
  user: store.auth.user,
  datasetId: store.visualization.datasetId,
  layerId: store.visualization.layerId,
  customSelected: store.visualization.customSelected,
  dataSourcesInitialized: store.themes.dataSourcesInitialized,
  visualizationUrl: store.visualization.visualizationUrl,
});

export default connect(mapStoreToProps, null)(TimelapseButton);
