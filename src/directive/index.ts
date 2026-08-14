import Contextmenu from './contextmenu';
import ClickOutside from './clickOutside';
import Tooltip from './tooltip';
import Loading from './loading';
export default {
  install(app: any) {
    app.directive('contextmenu', Contextmenu);
    app.directive('click-outside', ClickOutside);
    app.directive('tooltip', Tooltip);
    app.directive('loading', Loading);
  }
};
