import React, { Component } from 'react';
import moment from 'moment';
import axios from 'axios';
import { connect } from 'react-redux';
import { EOBVisualizationTimeSelect } from '../../junk/EOBCommon/EOBVisualizationTimeSelect/EOBVisualizationTimeSelect';
import { EOBEffectsPanel } from '../../junk/EOBEffectsPanel/EOBEffectsPanel';
import EOBAdvancedHolder from '../../junk/EOBAdvancedHolder/EOBAdvancedHolder';
import { EOBButton } from '../../junk/EOBCommon/EOBButton/EOBButton';
import { LayersFactory, BBox, CRS_EPSG4326, Interpolator } from '@sentinel-hub/sentinelhub-js';
import Rodal from 'rodal';
import { t } from 'ttag';
//Those 3 needs to be imported for synax highlighting to work properly.
import 'codemirror/mode/javascript/javascript';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/dracula.css';

import store, { mainMapSlice, visualizationSlice, tabsSlice, compareLayersSlice } from '../../store';
import Visualizations from './Visualizations';
import Loader from '../../Loader/Loader';
import './VisualizationPanel.scss';
import { sortLayers } from './VisualizationPanel.utils';
import {
  getDataSourceHandler,
  S3SLSTR,
  getDatasetLabel,
  S2L1C,
  S2L2A,
} from '../SearchPanel/dataSourceHandlers/dataSourceHandlers';
import { VisualizationPanelHeaderActions } from './VisualizationPanelHeaderActions';
import { b64EncodeUnicode } from '../../utils/base64MDN';
import { parseEvalscriptBands } from '../../utils';
import ZoomInNotification from './ZoomInNotification';
import { getAppropriateAuthToken } from '../../App';
import { EDUCATION_MODE } from '../../const';

const _legacySLSTRActiveLayer = {
  groupChannels: channels => {
    const datasourceHandler = getDataSourceHandler(S3SLSTR);
    return datasourceHandler.groupChannels(channels);
  },
};

class VisualizationPanel extends Component {
  defaultState = {
    currentCustomView: null,
    visualizations: null,
    bands: null,
    selectedLayer: undefined,
    displayBandSelection: false,
    supportsCustom: true,
    sibling: {},
    noSiblingDataModal: false,
    dataFusion: this.props.dataFusion,
    selectedIndexBands: { a: null, b: null },
    displaySocialShareOptions: false,
  };
  state = this.defaultState;

  componentDidUpdate(prevProps) {
    if (!this.props.authToken) {
      return;
    }
    const hasTokenBeenSet = !prevProps.authToken && this.props.authToken;
    if (hasTokenBeenSet && this.props.dataSourcesInitialized && this.props.datasetId) {
      // Handles visualization passed via url - it has to wait for token to be set
      this.createVisualizations();
      this.manageSiblings();
    }
    if (
      this.props.datasetId &&
      prevProps.datasetId !== this.props.datasetId &&
      this.props.dataSourcesInitialized
    ) {
      this.setState({
        ...this.defaultState,
      });
      this.createVisualizations();
      this.manageSiblings();
    }
    if (this.props.datasetId && !prevProps.dataSourcesInitialized && this.props.dataSourcesInitialized) {
      this.createVisualizations();
      this.manageSiblings();
    }

    if (this.props.fromTime !== prevProps.fromTime || this.props.toTime !== prevProps.toTime) {
      this.manageSiblings();
    }
  }

  async getLayersAndBands() {
    const { datasetId, selectedThemeId, selectedThemesListId, themesLists } = this.props;
    const selectedTheme = themesLists[selectedThemesListId].find(t => t.id === selectedThemeId);

    const datasourceHandler = getDataSourceHandler(datasetId);
    const urls = datasourceHandler.getUrlsForDataset(datasetId);
    const allBands = datasourceHandler.getBands(datasetId);
    const shJsDatasetId = datasourceHandler.getSentinelHubDataset(datasetId)
      ? datasourceHandler.getSentinelHubDataset(datasetId).id
      : null;
    const supportsCustom = datasourceHandler.supportsCustomLayer(datasetId);
    const supportsTimeRange = datasourceHandler.supportsTimeRange();

    let allLayers = [];
    for (let url of urls) {
      const { layersExclude, layersInclude, name } = selectedTheme.content.find(t => t.url === url);

      let shjsLayers = await LayersFactory.makeLayers(url, (_, dataset) =>
        !shJsDatasetId ? true : dataset.id === shJsDatasetId,
      );
      if (datasourceHandler.updateLayersOnVisualization()) {
        // We have to update layers to get thier legend info and additionally acquisitionMode, polarization for S1. WMS layers don't need updating
        await Promise.all(
          shjsLayers.map(async l => {
            await l.updateLayerFromServiceIfNeeded();
          }),
        );
      }
      let layers = datasourceHandler.getLayers(shjsLayers, datasetId, url, layersExclude, layersInclude);
      for (let layer of layers) {
        if (allLayers.find(l => l.layerId === layer.layerId)) {
          layer.description += ` (${name})`;
          layer.duplicateLayerId = layer.layerId + ` (${name})`;
        }
      }

      allLayers = [...allLayers, ...layers];
    }

    return { allLayers: sortLayers(allLayers), allBands, supportsCustom, supportsTimeRange };
  }

  generateEvalscript(bands, datasetId, config) {
    const datasourceHandler = getDataSourceHandler(datasetId);
    return datasourceHandler.generateEvalscript(bands, datasetId, config);
  }

  setSelectedVisualization = layer => {
    const layerId = layer.duplicateLayerId ? layer.duplicateLayerId : layer.layerId;
    this.setState({
      selectedLayer: layerId,
    });
    store.dispatch(
      visualizationSlice.actions.setVisualizationParams({
        visualizationUrl: layer.url,
        layerId: layer.layerId,
        customSelected: false,
        visibleOnMap: true,
      }),
    );
  };

  setCustomVisualization = ({ displayBandSelection = true } = {}) => {
    if (displayBandSelection) {
      this.setState({
        displayBandSelection: true,
      });
    }
    if (!this.props.visualizationUrl) {
      store.dispatch(visualizationSlice.actions.setVisualizationUrl(this.state.visualizations[0].url));
    }
    store.dispatch(
      visualizationSlice.actions.setVisualizationParams({
        layerId: null,
        customSelected: true,
        visibleOnMap: true,
      }),
    );
  };

  onDataFusionChange = value => {
    this.setState({
      dataFusion: value,
    });
  };

  onBack = () => {
    this.setState({
      currentCustomView: false,
      displayBandSelection: false,
    });
  };

  toggleValue = key => {
    if (key === 'showEffects') {
      this.props.setShowEffects(!this.props.showEffects);
      return;
    }

    this.setState(prevState => ({
      [key]: !prevState[key],
    }));
  };

  toggleVisible = () => {
    store.dispatch(visualizationSlice.actions.setVisibleOnMap(!this.props.visibleOnMap));
  };

  onZoomToTile = () => {
    const { zoomToTileConfig } = this.props;
    store.dispatch(
      mainMapSlice.actions.setPosition({
        lat: zoomToTileConfig.lat,
        lng: zoomToTileConfig.lng,
        zoom: zoomToTileConfig.zoom,
      }),
    );
  };

  createVisualizations = async () => {
    const { datasetId, selectedVisualizationId, customSelected, toTime, evalscripturl } = this.props;
    if (!datasetId) {
      console.error('Cannot create a visualization without a datasetId');
      return;
    }

    this.setState({
      visualizations: null,
    });
    store.dispatch(tabsSlice.actions.setTabIndex(2));

    const { allLayers, allBands, supportsCustom, supportsTimeRange } = await this.getLayersAndBands();

    if (allLayers.length === 0) {
      return;
    }

    if (!supportsTimeRange) {
      store.dispatch(
        visualizationSlice.actions.setVisualizationTime({
          fromTime: null,
          toTime: toTime,
        }),
      );
    }

    if (supportsCustom) {
      let bands;
      if (this.props.evalscript) {
        bands = parseEvalscriptBands(this.props.evalscript).filter(
          band => !!allBands.find(b => b.name === band),
        );
      }
      if (!bands || bands.length !== 3) {
        // Some datasets might have only 1 or 2 available bands. This assures `bands` always contains exactly 3.
        bands = [...allBands, ...allBands, ...allBands].slice(0, 3).map(b => b.name);
      }

      const selectedBands = {
        r: bands[0],
        g: bands[1],
        b: bands[2],
      };

      const evalscript =
        this.props.evalscript && !evalscripturl
          ? this.props.evalscript
          : this.generateEvalscript(selectedBands, datasetId);

      if (evalscripturl) {
        axios
          .get(evalscripturl, { timeout: 10000 })
          .then(r => {
            this.setState({
              evalscript: r.data,
            });
          })
          .catch();
      } else {
        store.dispatch(visualizationSlice.actions.setEvalscript(evalscript));
      }

      this.setState({
        visualizations: allLayers,
        bands: allBands,
        evalscript: evalscript,
        evalscripturl: evalscripturl,
        selectedBands: selectedBands,
        supportsCustom: true,
        useEvalscriptUrl: evalscripturl && !this.props.evalscript,
      });
    } else {
      this.setState({
        visualizations: allLayers,
        supportsCustom: false,
      });
    }

    if (!customSelected) {
      const selectedLayer = selectedVisualizationId
        ? allLayers.find(l => l.layerId === selectedVisualizationId)
        : allLayers[0];
      this.setSelectedVisualization(selectedLayer || allLayers[0]);
    } else {
      this.setCustomVisualization({ displayBandSelection: false });
    }
  };

  /**
   * Custom visualization rendering, composite mode, on drag n drop change
   * @param {*} bands { r: ... , g: ... , b: ...} bands
   */
  onCompositeChange = bands => {
    const evalscript = this.generateEvalscript(bands, this.props.datasetId);

    this.setState({
      selectedBands: bands,
      evalscript: evalscript,
    });
    store.dispatch(
      visualizationSlice.actions.setVisualizationParams({ evalscript: evalscript, dataFusion: {} }),
    );
  };

  /**
   * Custom visualization rendering, index mode, on drag n drop change
   * @param {*} bands { a: ... , b: ...} bands
   * @param {*} config an object representing the eval script configuration, can containt equation formula, ramp/gradient values
   */
  onIndexScriptChange = (bands, config) => {
    if (Object.values(bands).filter(item => item === null).length > 0) {
      this.setState({
        selectedIndexBands: bands,
      });
    } else {
      const evalscript = this.generateEvalscript(bands, this.props.datasetId, config);
      this.setState({
        selectedIndexBands: bands,
        evalscript: evalscript,
      });
      store.dispatch(
        visualizationSlice.actions.setVisualizationParams({ evalscript: evalscript, dataFusion: {} }),
      );
    }
  };

  /**
   * Used only by the custom script green refresh button
   */
  onVisualizeEvalscript = () => {
    if (this.state.useEvalscriptUrl) {
      store.dispatch(
        visualizationSlice.actions.setVisualizationParams({
          evalscript: null,
          evalscripturl: this.state.evalscripturl,
          dataFusion: this.state.dataFusion,
        }),
      );
    } else {
      store.dispatch(
        visualizationSlice.actions.setVisualizationParams({
          evalscript: this.state.evalscript,
          evalscripturl: null,
          dataFusion: this.state.dataFusion,
        }),
      );

      const bands = parseEvalscriptBands(this.state.evalscript).filter(
        band => !!this.state.bands.find(b => b.name === band),
      );
      if (bands && bands.length === 3) {
        this.setState({
          selectedBands: {
            r: bands[0],
            g: bands[1],
            b: bands[2],
          },
        });
      }
    }
  };

  // this should be probably moved to utils
  getMinMaxDates = asMoment => {
    let minDate;
    let maxDate;
    const dsh = getDataSourceHandler(this.props.datasetId);
    if (dsh) {
      const minMaxDates = dsh.getMinMaxDates(this.props.datasetId);
      minDate = minMaxDates.minDate;
      maxDate = minMaxDates.maxDate;
    }
    if (asMoment) {
      minDate = minDate ? minDate : moment.utc('1970-01-01');
      maxDate = maxDate ? maxDate : moment.utc();
    } else {
      minDate = minDate ? minDate.toDate() : new Date('1970-01-01');
      maxDate = maxDate ? maxDate.toDate() : new Date();
    }
    return { minDate, maxDate };
  };

  onFetchAvailableDates = async (fromMoment, toMoment) => {
    const { mapBounds, selectedVisualizationId } = this.props;
    const { visualizations } = this.state;
    const bbox = new BBox(
      CRS_EPSG4326,
      mapBounds.getWest(),
      mapBounds.getSouth(),
      mapBounds.getEast(),
      mapBounds.getNorth(),
    );

    // Get layer for selected visualization. If layer is not found (custom layer), just use first layer from list.
    let layer = visualizations.find(l => l.layerId === selectedVisualizationId);
    if (!layer && visualizations && visualizations.length > 0) {
      layer = visualizations[0];
    }
    let dates = [];
    if (layer) {
      dates = await layer.findDatesUTC(bbox, fromMoment.toDate(), toMoment.toDate());
    }
    return dates;
  };

  onQueryDatesForActiveMonth = async date => {
    const monthStart = moment(date).startOf('month');
    const monthEnd = moment(date).endOf('month');
    const dates = await this.onFetchAvailableDates(monthStart, monthEnd);
    return dates;
  };

  onUpdateScript = state => {
    this.setState({
      evalscript: state.evalscript,
      evalscripturl: state.evalscripturl,
      useEvalscriptUrl: state.isEvalUrl,
    });
  };

  onGetAndSetNextPrev = async direction => {
    const { toTime } = this.props;
    const { minDate, maxDate } = this.getMinMaxDates(true);
    let dates;
    const NO_DATES_FOUND = 'No dates found';

    if (direction === 'prev') {
      const start = minDate.utc().startOf('day');
      const end = toTime
        .clone()
        .subtract(1, 'day')
        .endOf('day');
      dates = await this.onFetchAvailableDates(start, end).catch(err => {
        throw NO_DATES_FOUND;
      });
      // if no previous date is found throw no dates found
      if (dates.length < 1) {
        throw NO_DATES_FOUND;
      }
      return dates[0];
    }

    if (direction === 'next') {
      const start = toTime
        .clone()
        .utc()
        .add(1, 'day')
        .startOf('day');
      const end = maxDate.utc();
      dates = await this.onFetchAvailableDates(start, end).catch(err => {
        throw NO_DATES_FOUND;
      });
      // if no future date is found throw no dates found
      if (dates.length < 1) {
        throw NO_DATES_FOUND;
      }
      return dates[dates.length - 1];
    }
  };

  updateSelectedTime = time => {
    time = time.split('/');
    let fromTime;
    let toTime;
    if (time.length === 1) {
      fromTime = moment.utc(time[0]).startOf('day');
      toTime = moment.utc(time[0]).endOf('day');
      this.props.setTimeSpanExpanded(false);
    }
    if (time.length === 2) {
      fromTime = moment(time[0]);
      toTime = moment(time[1]);
      this.props.setTimeSpanExpanded(true);
    }
    if (!getDataSourceHandler(this.props.datasetId).supportsTimeRange()) {
      fromTime = null;
    }
    store.dispatch(
      visualizationSlice.actions.setVisualizationTime({
        fromTime: fromTime,
        toTime: toTime,
      }),
    );
  };

  getSibling = datasetId => {
    switch (datasetId) {
      case S2L2A:
        return { siblingId: S2L1C, siblingShortName: 'L1C' };
      case S2L1C:
        return { siblingId: S2L2A, siblingShortName: 'L2A' };
      default:
        return {};
    }
  };

  setSibling = async datasetId => {
    const isSiblingDataAvailable = await this.searchForSiblingData(datasetId);
    if (!isSiblingDataAvailable) {
      this.setState({
        noSiblingDataModal: true,
      });
      return;
    }
    store.dispatch(
      visualizationSlice.actions.setVisualizationParams({
        layerId: undefined,
        visualizationUrl: undefined,
        evalscript: undefined,
        evalscripturl: undefined,
        datasetId: datasetId,
      }),
    );
  };

  searchForSiblingData = async (datasetId, showProgress = true) => {
    const { fromTime, toTime, mapBounds } = this.props;
    if (showProgress) {
      this.setState({
        searchInProgress: true,
      });
    }

    let hasData;
    const datasourceHandler = getDataSourceHandler(datasetId);
    const shJsDataset = datasourceHandler.getSentinelHubDataset(datasetId);
    const url = datasourceHandler.getUrlsForDataset(datasetId)[0];

    if (!url) {
      return false;
    }

    const layers = await LayersFactory.makeLayers(url);
    const layer = layers.find(l => l.dataset === shJsDataset);

    const bbox = new BBox(
      CRS_EPSG4326,
      mapBounds.getWest(),
      mapBounds.getSouth(),
      mapBounds.getEast(),
      mapBounds.getNorth(),
    );

    const data = await layer.findTiles(bbox, fromTime, toTime);
    hasData = !!data.tiles.length;
    if (showProgress) {
      this.setState({
        searchInProgress: false,
      });
    }
    return hasData;
  };

  manageSiblings = async () => {
    const { datasetId } = this.props;
    const { siblingShortName, siblingId } = this.getSibling(datasetId);
    if (!siblingId) {
      return;
    }
    const isSiblingDataAvailable = await this.searchForSiblingData(siblingId, false);
    this.setState({
      sibling: { siblingShortName, siblingId, isSiblingDataAvailable: !!isSiblingDataAvailable },
    });
  };

  renderNoSibling = datasetId => {
    const { fromTime, toTime } = this.props;
    return (
      <Rodal
        animation="slideUp"
        visible={true}
        width={400}
        height={130}
        onClose={() => this.setState({ noSiblingDataModal: false })}
        closeOnEsc={true}
      >
        <div>
          <h3>{t`No tile found`}</h3>
          {`No ${getDatasetLabel(datasetId)} tiles found from ${fromTime
            .utc()
            .format('YYYY-MM-DD HH:mm:ss')} to ${toTime
            .utc()
            .format('YYYY-MM-DD HH:mm:ss')} for the current view.`}
        </div>
      </Rodal>
    );
  };

  updateGainEffect = x => {
    store.dispatch(visualizationSlice.actions.setGainEffect(parseFloat(x)));
  };
  updateGammaEffect = x => {
    store.dispatch(visualizationSlice.actions.setGammaEffect(parseFloat(x)));
  };
  updateRedRangeEffect = range => {
    store.dispatch(visualizationSlice.actions.setRedRangeEffect(range));
  };
  updateGreenRangeEffect = range => {
    store.dispatch(visualizationSlice.actions.setGreenRangeEffect(range));
  };
  updateBlueRangeEffect = range => {
    store.dispatch(visualizationSlice.actions.setBlueRangeEffect(range));
  };
  updateMinQa = x => {
    store.dispatch(visualizationSlice.actions.setMinQa(parseInt(x)));
  };

  updateUpsampling = x => {
    store.dispatch(visualizationSlice.actions.setUpsampling(x ? x : undefined));
  };

  updateDownsampling = x => {
    store.dispatch(visualizationSlice.actions.setDownsampling(x ? x : undefined));
  };

  resetEffects = () => {
    store.dispatch(visualizationSlice.actions.resetEffects());
  };

  doesDatasetSupportMinQa = datasetId => {
    const dsh = getDataSourceHandler(datasetId);
    if (dsh) {
      return dsh.supportsMinQa();
    }
    return false;
  };

  getDefaultMinQa = datasetId => {
    const dsh = getDataSourceHandler(datasetId);
    if (dsh && dsh.supportsMinQa()) {
      return dsh.getDefaultMinQa(datasetId);
    }
    return null;
  };

  doesDatasetSupportInterpolation = datasetId => {
    const dsh = getDataSourceHandler(datasetId);
    if (dsh) {
      return dsh.supportsInterpolation();
    }
    return false;
  };

  toggleSocialSharePanel = () => {
    this.setState(prevState => ({
      displaySocialShareOptions: !prevState.displaySocialShareOptions,
    }));
  };

  addToCompare = () => {
    const {
      zoom,
      lat,
      lng,
      fromTime,
      toTime,
      datasetId,
      visualizationUrl,
      selectedVisualizationId: layerId,
      evalscript,
      evalscripturl,
      dataFusion,
      gain,
      gamma,
      customSelected,
      selectedThemeId,
    } = this.props;

    const title = `${getDatasetLabel(datasetId)}: ${customSelected ? 'Custom' : layerId}`;

    const newCompareLayer = {
      title,
      zoom,
      lat,
      lng,
      fromTime,
      toTime,
      datasetId,
      visualizationUrl,
      layerId,
      evalscript: customSelected ? evalscript : '',
      evalscripturl: customSelected ? evalscripturl : '',
      dataFusion,
      gain,
      gamma,
      themeId: selectedThemeId,
    };

    store.dispatch(compareLayersSlice.actions.addToCompare(newCompareLayer));
  };

  renderHeader = () => {
    const { datasetId, selectedModeId, fromTime, toTime } = this.props;
    const { siblingShortName, siblingId, isSiblingDataAvailable } = this.state.sibling;
    const { minDate, maxDate } = this.getMinMaxDates();
    let timespanSupported = false;
    const dsh = getDataSourceHandler(datasetId);
    if (dsh) {
      timespanSupported = dsh.supportsTimeRange() && selectedModeId !== EDUCATION_MODE.id;
    }
    return (
      <div className="header">
        <div className="dataset-info">
          <div className="title">
            <b>{t`Dataset`}: </b>
            <div className="dataset-name">{`${getDatasetLabel(datasetId)}`}</div>
            {siblingShortName && (
              <EOBButton
                style={{ marginLeft: 20 }}
                className="small"
                text={t`Show` + ` ${siblingShortName}`}
                disabled={!isSiblingDataAvailable}
                onClick={() => this.setSibling(siblingId)}
                loading={this.state.searchInProgress}
              />
            )}
          </div>
          {this.state.noSiblingDataModal && this.renderNoSibling(siblingId)}
        </div>
        <div className="date-selection">
          <EOBVisualizationTimeSelect
            maxDate={maxDate}
            minDate={minDate}
            showNextPrev={true}
            onGetAndSetNextPrev={this.onGetAndSetNextPrev}
            onQueryDatesForActiveMonth={this.onQueryDatesForActiveMonth}
            fromTime={fromTime}
            toTime={toTime}
            updateSelectedTime={this.updateSelectedTime}
            timespanSupported={timespanSupported}
          />
        </div>
      </div>
    );
  };

  render() {
    const { useEvalscriptUrl, visualizations } = this.state;
    const {
      showEffects,
      gainEffect,
      gammaEffect,
      redRangeEffect,
      greenRangeEffect,
      blueRangeEffect,
      minQa,
      upsampling,
      downsampling,
      datasetId,
      zoomToTileConfig,
    } = this.props;

    const legacyActiveLayer = {
      ...(this.props.datasetId === S3SLSTR ? _legacySLSTRActiveLayer : {}),
      baseUrls: {
        WMS: this.props.visualizationUrl,
      },
    };

    const supportedInterpolations = [Interpolator.BILINEAR, Interpolator.BICUBIC, Interpolator.NEAREST];

    return (
      <div key={this.props.datasetId} className="visualization-panel">
        {this.renderHeader()}
        <VisualizationPanelHeaderActions
          onZoomToTile={this.onZoomToTile}
          onSavePin={this.props.onSavePin}
          displayZoomToTile={zoomToTileConfig !== null}
          isSelectedLayerVisible={this.props.visibleOnMap}
          toggleVisible={this.toggleVisible}
          showEffects={this.props.showEffects}
          toggleValue={this.toggleValue}
          addToCompare={this.addToCompare}
          toggleSocialSharePanel={this.toggleSocialSharePanel}
          displaySocialShareOptions={this.state.displaySocialShareOptions}
          datasetId={datasetId}
        />
        {showEffects ? (
          <EOBEffectsPanel
            effects={{
              gainEffect: gainEffect,
              gammaEffect: gammaEffect,
              redRangeEffect: redRangeEffect,
              greenRangeEffect: greenRangeEffect,
              blueRangeEffect: blueRangeEffect,
              minQa: minQa !== undefined ? minQa : this.getDefaultMinQa(datasetId),
              upsampling: upsampling,
              downsampling: downsampling,
            }}
            isFISLayer={false}
            defaultMinQaValue={this.getDefaultMinQa(datasetId)}
            doesDatasetSupportMinQa={this.doesDatasetSupportMinQa(datasetId)}
            doesDatasetSupportInterpolation={this.doesDatasetSupportInterpolation(datasetId)}
            interpolations={supportedInterpolations}
            onUpdateGainEffect={this.updateGainEffect}
            onUpdateGammaEffect={this.updateGammaEffect}
            onUpdateRedRangeEffect={this.updateRedRangeEffect}
            onUpdateGreenRangeEffect={this.updateGreenRangeEffect}
            onUpdateBlueRangeEffect={this.updateBlueRangeEffect}
            onUpdateMinQa={this.updateMinQa}
            onUpdateUpsampling={this.updateUpsampling}
            onUpdateDownsampling={this.updateDownsampling}
            onResetEffects={this.resetEffects}
          />
        ) : (
          <div className="layer-datasource-picker">
            {this.props.datasetId && !this.state.displayBandSelection && (
              <div>
                {!visualizations ? (
                  <Loader />
                ) : (
                  <Visualizations
                    visualizations={visualizations}
                    selectedLayer={this.state.selectedLayer}
                    setSelectedVisualization={this.setSelectedVisualization}
                    setCustomVisualization={this.setCustomVisualization}
                    supportsCustom={this.state.supportsCustom}
                  />
                )}
                <ZoomInNotification />
              </div>
            )}
            {this.state.displayBandSelection && this.props.customSelected && (
              <EOBAdvancedHolder
                currView={this.state.currentCustomView}
                channels={this.state.bands}
                evalscripturl={this.state.evalscripturl}
                evalscript={b64EncodeUnicode(this.state.evalscript)}
                dataFusion={this.state.dataFusion}
                initialTimespan={`${this.props.fromTime.toISOString()}/${this.props.toTime.toISOString()}`}
                layers={this.state.selectedBands}
                indexLayers={this.state.selectedIndexBands}
                activeLayer={legacyActiveLayer}
                isEvalUrl={useEvalscriptUrl}
                style={null}
                onUpdateScript={this.onUpdateScript}
                onDataFusionChange={this.onDataFusionChange}
                onBack={this.onBack}
                onCodeMirrorRefresh={this.onVisualizeEvalscript}
                onCompositeChange={this.onCompositeChange}
                onIndexScriptChange={this.onIndexScriptChange}
              />
            )}
          </div>
        )}
      </div>
    );
  }
}

const mapStoreToProps = store => ({
  datasetId: store.visualization.datasetId,
  selectedVisualizationId: store.visualization.layerId,
  customSelected: store.visualization.customSelected,
  visibleOnMap: store.visualization.visibleOnMap,
  visualizationUrl: store.visualization.visualizationUrl,
  evalscript: store.visualization.evalscript,
  evalscripturl: store.visualization.evalscripturl,
  dataFusion: store.visualization.dataFusion,
  fromTime: store.visualization.fromTime,
  toTime: store.visualization.toTime,
  dataSourcesInitialized: store.themes.dataSourcesInitialized,
  mapBounds: store.mainMap.bounds,
  selectedModeId: store.themes.selectedModeId,
  authToken: getAppropriateAuthToken(store.auth, store.themes.selectedThemeId),
  gainEffect: store.visualization.gainEffect,
  gammaEffect: store.visualization.gammaEffect,
  redRangeEffect: store.visualization.redRangeEffect,
  greenRangeEffect: store.visualization.greenRangeEffect,
  blueRangeEffect: store.visualization.blueRangeEffect,
  minQa: store.visualization.minQa,
  upsampling: store.visualization.upsampling,
  downsampling: store.visualization.downsampling,
  selectedThemesListId: store.themes.selectedThemesListId,
  themesLists: store.themes.themesLists,
  selectedThemeId: store.themes.selectedThemeId,
  lat: store.mainMap.lat,
  lng: store.mainMap.lng,
  zoom: store.mainMap.zoom,
  selectedLanguage: store.language.selectedLanguage,
});

export default connect(mapStoreToProps, null)(VisualizationPanel);
