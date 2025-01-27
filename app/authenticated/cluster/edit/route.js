import { get, set } from '@ember/object';
import { inject as service } from '@ember/service';
import Route from '@ember/routing/route';
import { hash, hashSettled/* , all */ } from 'rsvp';
import { loadScript, loadStylesheet, proxifyUrl } from 'shared/utils/load-script';
import { isEmpty } from '@ember/utils';

export default Route.extend({
  access:              service(),
  globalStore:         service(),
  roleTemplateService: service('roleTemplate'),

  model() {
    const globalStore = this.get('globalStore');
    const cluster     = this.modelFor('authenticated.cluster');

    return hash({
      originalCluster:            cluster,
      cluster:                    cluster.clone(),
      kontainerDrivers:           globalStore.findAll('kontainerDriver'),
      nodeTemplates:              globalStore.findAll('nodeTemplate'),
      nodeDrivers:                globalStore.findAll('nodeDriver'),
      psps:                       globalStore.findAll('podSecurityPolicyTemplate'),
      roleTemplates:              get(this, 'roleTemplateService').get('allFilteredRoleTemplates'),
      users:                      globalStore.findAll('user'),
      clusterRoleTemplateBinding: globalStore.findAll('clusterRoleTemplateBinding'),
      me:                         get(this, 'access.principal'),
    });
  },

  afterModel(model) {
    // load the css/js url here, if the url loads fail we should error the driver out
    // show the driver in the ui, greyed out, and possibly add error text "can not load comonent from url [put url here]"

    let { kontainerDrivers } = model;
    let externalDrivers      = kontainerDrivers.filter( (d) => d.uiUrl !== '' && d.state === 'active');
    let promises             = {};

    externalDrivers.forEach( (d) => {
      if (get(d, 'hasUi')) {
        const jsUrl  = proxifyUrl(d.uiUrl, this.get('app.proxyEndpoint'));
        const cssUrl = proxifyUrl(d.uiUrl.replace(/\.js$/, '.css'), get(this, 'app.proxyEndpoint'));

        // skip setProperties cause of weird names
        set(promises, `${ d.name }Js`, loadScript(jsUrl, `driver-ui-js-${ d.name }`));
        set(promises, `${ d.name }Css`, loadStylesheet(cssUrl, `driver-ui-css-${ d.name }`));
      }
    });

    if (isEmpty(promises)) {
      return model;
    } else {
      return hashSettled(promises).then( (settled) => {
        let allkeys = Object.keys(settled);

        allkeys.forEach( (key) => {
          if (get(settled, `${ key }.state`) === 'rejected') {
            let tmp = key.indexOf('Js') > -1 ? key.replace(/\Js$/, '') : key.replace(/\Css$/, '');
            let match = kontainerDrivers.findBy('id', tmp);

            console.log('Error Loading External Component for: ', match);
            if (match && get(match, 'scriptError') !== true) {
              set(match, 'scriptError', get(this, 'intl').t('clusterNew.externalError'));
            }
          }
        });
      }).finally(() => {
        return model;
      });
    }
  },

  setupController(controller/* , model*/) {
    this._super(...arguments);
    set(controller, 'step', 1);
  },

  resetController(controller, isExiting /* , transition*/ ) {
    if (isExiting) {
      controller.set('errors', null);
      controller.set('provider', null);
    }
  },

  queryParams: { provider: { refreshModel: true } },
});
