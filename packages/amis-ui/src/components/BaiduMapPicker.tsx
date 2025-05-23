import React from 'react';
import {ClassNamesFn, themeable} from 'amis-core';
import {loadScript, autobind, uuid} from 'amis-core';
import debounce from 'lodash/debounce';
import {Icon} from './icons';

declare const BMap: any;

/**
 * 坐标常量说明：
 * COORDINATES_WGS84 = 1, WGS84坐标
 * COORDINATES_WGS84_MC = 2, WGS84的平面墨卡托坐标
 * COORDINATES_GCJ02 = 3，GCJ02坐标
 * COORDINATES_GCJ02_MC = 4, GCJ02的平面墨卡托坐标
 * COORDINATES_BD09 = 5, 百度bd09经纬度坐标
 * COORDINATES_BD09_MC = 6，百度bd09墨卡托坐标
 * COORDINATES_MAPBAR = 7，mapbar地图坐标
 * COORDINATES_51 = 8，51地图坐标
 */
const COORDINATES_WGS84 = 1;
const COORDINATES_WGS84_MC = 2;
const COORDINATES_GCJ02 = 3;
const COORDINATES_GCJ02_MC = 4;
const COORDINATES_BD09 = 5;
const COORDINATES_BD09_MC = 6;
const COORDINATES_MAPBAR = 7;
const COORDINATES_51 = 8;

interface MapPickerProps {
  ak: string;
  coordinatesType: string;
  classnames: ClassNamesFn;
  classPrefix: string;
  placeholder?: string;
  value?: {
    address: string;
    lat: number;
    lng: number;
    city?: string;
    zoom?: number;
  };
  onChange?: (value: any) => void;
  autoSelectCurrentLoc?: boolean;
  onlySelectCurrentLoc?: boolean;
  showSug?: boolean;
  showGeoLoc?: boolean;
  hideViewControl?: boolean;
  mapStyle?: React.CSSProperties;
}

interface LocationItem {
  title?: string;
  address: string;
  lat: number;
  lng: number;
  city?: string;
}

interface MapPickerState {
  inputValue: string;
  locIndex?: number;
  locs: Array<LocationItem>;
  sugs: Array<string>;
  innerValue?: {
    address: string;
    lat: number;
    lng: number;
    city?: string;
    zoom?: number;
  };
}

// 记录百度地图SDK加载状态
let BMapLoadingPromise: Promise<any> | null = null;

export class BaiduMapPicker extends React.Component<
  MapPickerProps,
  MapPickerState
> {
  state: MapPickerState = {
    inputValue: '',
    locs: [],
    locIndex: -1,
    sugs: [],
    innerValue: this.props.value // 内部定位的值，用于内部更新地图定位点
  };

  id = uuid();
  mapRef: React.RefObject<HTMLDivElement> = React.createRef();
  placeholderInput?: HTMLInputElement;
  map: any;
  ac: any;
  search = debounce(
    () => {
      if (this.state.inputValue) {
        this.ac?.search(this.state.inputValue);
      } else {
        this.setState({
          sugs: []
        });
      }
    },
    250,
    {
      trailing: true,
      leading: false
    }
  );
  convertor: any;

  componentDidMount() {
    if ((window as any).BMap) {
      this.initMap();
    } else if (BMapLoadingPromise) {
      BMapLoadingPromise.then(this.initMap).then(() => {
        BMapLoadingPromise = null;
      });
    } else {
      BMapLoadingPromise = loadScript(
        `//api.map.baidu.com/api?v=3.0&ak=${this.props.ak}&callback={{callback}}`
      );
      BMapLoadingPromise.then(this.initMap).then(() => {
        BMapLoadingPromise = null;
      });
    }
  }

  componentWillUnmount() {
    this.ac?.dispose?.();
    this.placeholderInput && document.body.removeChild(this.placeholderInput!);

    delete this.placeholderInput;
    delete this.map;
  }

  componentDidUpdate(
    prevProps: Readonly<MapPickerProps>,
    prevState: Readonly<MapPickerState>
  ): void {
    // 值更新后需要重绘地图
    if (prevProps.value !== this.props.value) {
      this.setState({
        innerValue: this.props.value
      });
    } else if (
      this.state.innerValue !== prevState.innerValue &&
      this.state.innerValue &&
      this.map
    ) {
      this.map.clearOverlays();

      const value = this.state.innerValue;

      let point = value
        ? new BMap.Point(value.lng, value.lat)
        : new BMap.Point(116.404, 39.915);
      const zoom = value?.zoom || 15;

      if (this.props.coordinatesType == 'gcj02') {
        this.covertPoint(point, COORDINATES_GCJ02, COORDINATES_BD09).then(
          point => this.map.centerAndZoom(point, zoom)
        );
      } else {
        this.map.centerAndZoom(point, zoom);
      }

      const mk = new BMap.Marker(point);
      // 增加定位点
      this.map.addOverlay(mk);
      // 移动到中心
      this.map.panTo(point);
    }
  }

  @autobind
  async initMap() {
    const autoSelectCurrentLoc = this.props.autoSelectCurrentLoc ?? false;
    const map = new BMap.Map(this.mapRef.current, {
      enableMapClick: false
    });
    this.map = map;
    this.convertor = new BMap.Convertor();

    const value = this.props.value;
    let point = value
      ? new BMap.Point(value.lng, value.lat)
      : new BMap.Point(116.404, 39.915);
    const zoom = value?.zoom || 15;
    if (this.props.coordinatesType == 'gcj02') {
      point = await this.covertPoint(
        point,
        COORDINATES_GCJ02,
        COORDINATES_BD09
      );
      map.centerAndZoom(point, zoom);
    } else {
      map.centerAndZoom(point, zoom);
    }

    if (!this.props.hideViewControl) {
      map.addControl(
        // @ts-ignore
        new BMap.NavigationControl({type: BMAP_NAVIGATION_CONTROL_SMALL})
      );
    }

    const geolocationControl = new BMap.GeolocationControl();
    geolocationControl.addEventListener('locationSuccess', (e: any) => {
      this.getLocations(e.point, autoSelectCurrentLoc);
    });
    if (this.props.showGeoLoc === true) {
      map.addControl(geolocationControl);
    }

    map.addEventListener('click', (e: any) => {
      if (this.props.onlySelectCurrentLoc) {
        return;
      }
      this.getLocations(e.point, true);
    });

    const input = document.createElement('input');
    input.className = 'invisible';
    this.placeholderInput = input;
    document.body.appendChild(input);

    this.ac = new BMap.Autocomplete({
      input,
      location: map,
      onSearchComplete: (result: any) => {
        // 说明已经销毁了。
        if (!this.map) {
          return;
        }

        const sugs: Array<string> = [];

        const poiLength = result.getNumPois();
        if (poiLength) {
          for (let i = 0; i < poiLength; i++) {
            const poi = result.getPoi(i);
            if (poi) {
              sugs.push(
                [
                  poi.province,
                  poi.city,
                  poi.district,
                  poi.street,
                  poi.business
                ].join(' ')
              );
            }
          }
          this.setState({
            sugs
          });
        }
      }
    });

    value ? this.getLocations(point) : geolocationControl.location();
  }

  @autobind
  getLocations(point: any, selectCurrentLoc?: boolean) {
    const map = this.map;

    map.clearOverlays();
    const mk = new BMap.Marker(point);
    map.addOverlay(mk);
    map.panTo(point);

    var geoc = new BMap.Geocoder();
    geoc.getLocation(point, (rs: any) => {
      // 说明已经销毁了。
      if (!this.map) {
        return;
      }

      const index = 0;
      const locs: Array<LocationItem> = [];

      locs.push({
        title: '当前位置',
        address: rs.address,
        city: rs.addressComponents.city,
        lat: rs.point.lat,
        lng: rs.point.lng
      });

      if (Array.isArray(rs.surroundingPois)) {
        rs.surroundingPois.forEach((item: any) => {
          locs.push({
            title: item.title,
            address: item.address,
            city: item.city,
            lat: item.point.lat,
            lng: item.point.lng
          });
        });
      }

      this.setState(
        {
          locIndex: index,
          locs
        },
        () => {
          if (!selectCurrentLoc) {
            return;
          }

          this.triggerOnChange(locs[0]);
        }
      );
    });
  }

  @autobind
  handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    this.setState(
      {
        inputValue: e.currentTarget.value
      },
      this.search
    );
  }

  @autobind
  handleSelect(e: React.MouseEvent<HTMLElement>) {
    const index = parseInt(e.currentTarget.getAttribute('data-index')!, 10);
    const loc = this.state.locs[index];

    this.setState(
      {
        locIndex: index,
        innerValue: loc
      },
      () => {
        this.triggerOnChange(loc);
      }
    );
  }

  covertPoint(point: any, from: number, to: number) {
    return new Promise((resolve, reject) => {
      this.convertor.translate([point], from, to, (res: any) => {
        if (res.status === 0 && res.points.length) {
          resolve(new BMap.Point(res.points[0].lng, res.points[0].lat));
        } else {
          reject();
        }
      });
    });
  }

  triggerOnChange(loc: LocationItem) {
    const point = new BMap.Point(loc.lng, loc.lat);
    if (this.props.coordinatesType == 'gcj02') {
      this.covertPoint(point, COORDINATES_BD09, COORDINATES_GCJ02).then(
        (convertedPoint: any) => {
          typeof this.props?.onChange === 'function' &&
            this.props.onChange({
              address: loc.address.trim() || loc.title,
              lat: convertedPoint.lat,
              lng: convertedPoint.lng,
              city: loc.city
            });
        }
      );
    } else {
      typeof this.props?.onChange === 'function' &&
        this.props?.onChange({
          address: loc.address.trim() || loc.title,
          lat: loc.lat,
          lng: loc.lng,
          city: loc.city
        });
    }
  }

  @autobind
  handleSugSelect(e: React.MouseEvent<HTMLDivElement>) {
    const value = e.currentTarget.innerText;
    this.setState({
      inputValue: value
    });

    var local = new BMap.LocalSearch(this.map, {
      // 智能搜索
      onSearchComplete: () => {
        const results = local.getResults();
        const poi = results.getPoi(0);
        this.setState({
          inputValue: poi?.title,
          sugs: []
        });
        this.getLocations(poi?.point, true);
      }
    });
    local.search(value);
  }

  render() {
    const {classnames: cx, mapStyle, placeholder} = this.props;
    const onlySelectCurrentLoc = this.props.onlySelectCurrentLoc ?? false;
    const {locIndex, locs, inputValue, sugs} = this.state;
    const showSug = this.props.showSug ?? true;
    const hasSug = Array.isArray(sugs) && sugs.length;

    return (
      <div className={cx('MapPicker')}>
        {!onlySelectCurrentLoc && (
          <div className={cx('MapPicker-search TextControl-control')}>
            <div className={cx('TextControl-input')}>
              <input
                onChange={this.handleChange}
                value={inputValue}
                placeholder={placeholder || '搜索地点'}
              />
            </div>
          </div>
        )}

        <div
          ref={this.mapRef}
          className={cx('MapPicker-map', {
            invisible: hasSug
          })}
          style={mapStyle}
        />

        {!showSug ? null : (
          <div
            className={cx('MapPicker-result', {
              invisible: hasSug
            })}
          >
            {!onlySelectCurrentLoc &&
              locs.map((item, index) => (
                <div
                  onClick={this.handleSelect}
                  key={index}
                  data-index={index}
                  className={cx('MapPicker-item')}
                >
                  <div className={cx('MapPicker-itemTitle')}>{item.title}</div>
                  <div className={cx('MapPicker-itemDesc')}>{item.address}</div>
                  {locIndex === index ? (
                    <Icon icon="success" className="icon" />
                  ) : null}
                </div>
              ))}
            {onlySelectCurrentLoc && locs.length > 0 && (
              <div
                onClick={this.handleSelect}
                key="locs-current"
                data-index={0}
                className={cx('MapPicker-item')}
              >
                <div className={cx('MapPicker-itemTitle')}>{locs[0].title}</div>
                <div className={cx('MapPicker-itemDesc')}>
                  {locs[0].address}
                </div>
                {locIndex === 0 ? (
                  <Icon icon="success" className="icon" />
                ) : null}
              </div>
            )}
          </div>
        )}

        {showSug && hasSug && !onlySelectCurrentLoc ? (
          <div className={cx('MapPicker-sug')}>
            {sugs.map(item => (
              <div
                onClick={this.handleSugSelect}
                className={cx('MapPicker-sugItem')}
                key={item}
              >
                {item}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
}

export default themeable(BaiduMapPicker);
