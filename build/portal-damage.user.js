// ==UserScript==
// @id             iitc-portal-damage@usefluthink
// @name           IITC plugin: Portal-Damage
// @category       Layer
// @version        0.1.0.20130703.92903-rc1
// @namespace      https://github.com/jonatkins/ingress-intel-total-conversion
// @updateURL      https://github.com/usefulthink/iitc-portal-damage/raw/master/build/portal-damage.meta.js
// @downloadURL    https://github.com/usefulthink/iitc-portal-damage/raw/master/build/portal-damage.user.js
// @description    [2013-07-03-092903] Allows you to draw things into the current map so you may plan your next move
// @include        https://www.ingress.com/intel*
// @include        http://www.ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// @grant          none
// ==/UserScript==


function wrapper() {
// ensure plugin framework is there, even if iitc is not yet loaded
if(typeof window.plugin !== 'function') window.plugin = function() {};



// PLUGIN START ////////////////////////////////////////////////////////

// use own namespace for plugin

var _plugin = window.plugin.portalDamage = function() {};

var resLayerGroup = null,
    enlLayerGroup = null;

_plugin.boot = function() {
    resLayerGroup = _plugin.resLayerGroup = new L.FeatureGroup();
    enlLayerGroup = _plugin.enlLayerGroup = new L.FeatureGroup();

    //add the layer
    window.addLayerGroup('Portal Damage (Resistance)', resLayerGroup, false);
    window.addLayerGroup('Portal Damage (Enlightened)', enlLayerGroup, false);
};





// portalDataLoaded: callback is passed the argument of
//              {portals : [portal, portal, ...]} where "portal" is the
//              data element and not the leaflet object. "portal" is an
//              array [GUID, time, details]. Plugin can manipulate the
//              array to change order or add additional values to the
//              details of a portal.
window.addHook('portalDataLoaded', function(data) {
    // add some required attributes to the portal-data
    var portals = data.portals;

    $.each(portals, function(uuid, portalData) {
        var portal = portalData[2];

        // reuired by the following calls
        portal.level = getPortalLevel(portal);

        portal.defenseValue = getDefenseValue(portal);
        portal.zapDamage = getZapDamage(portal);
        portal.zapRange = getZapRange(portal);
    });
});


// portalAdded: called when a portal has been received and is about to
//              be added to its layer group. Note that this does NOT
//              mean it is already visible or will be, shortly after.
//              If a portal is added to a hidden layer it may never be
//              shown at all. Injection point is in
//              code/map_data.js#renderPortal near the end. Will hand
//              the Leaflet CircleMarker for the portal in "portal" var.
window.addHook('portalAdded', function(data) {
    var portal = data.portal,
        pos = portal._latlng,
        portalDetails = portal.options.details,

        zapRange = portalDetails.zapRange,
        mitigation = portalDetails.defenseValue,
        hue, opacityFactor;

    var d = portalDetails.zapDamage, dSq = d*d;
    // color- (hue) and opacity-mapping by damage (curve-fitting by http://zunzun.com/)
    hue = Math.min(50, Math.max(0, 49.2 - 0.0654*d + 2.2e-5*dSq));
    opacityFactor = Math.min(1, Math.max(0, 2.75e-02 + 1.755e-03*d - 7.5e-07*dSq));

    // linear alternatives:
    //   hue = 50 - 1/30 * zapDamage;
    //   opacityFactor = 1/1500*zapDamage

    var path = L.circle(pos, zapRange, {
        stroke: true,
        weight: 1+Math.round(mitigation*6),
        color: 'hsl('+hue.toFixed(0)+', 100%, 50%)',
        opacity: 0.1+0.2*opacityFactor,
        fillOpacity: 0.12*opacityFactor
    });
console.log(portal);
    if(portalDetails.controllingTeam.team == 'ALIENS') {
        path.addTo(enlLayerGroup);
    } else if(portalDetails.controllingTeam.team == 'RESISTANCE') {
        path.addTo(resLayerGroup);
    }
});


// beforePortalReRender: the callback argument is
//              {portal: ent[2], oldPortal : d, portalGuid: ent[0], reRender : false}.
//              The callback needs to update the value of reRender to
//              true if the plugin has a reason to have the portal
//              redrawn. It is called early on in the
//              code/map_data.js#renderPortal as long as there was an
//              old portal for the guid.
window.addHook('beforePortalReRender', function(data) {
    // check if the corresponding damage-indicator needs to be redrawn
});


// portalDetailsUpdated: fired after the details in the sidebar have
//              been (re-)rendered Provides data about the portal that
//              has been selected.
window.addHook('portalDetailsUpdated', function(data) {
    // add defense-values to the sidebar-view
});



// ------ INTERNALS

function getZapRange(portal) { return 35+5*Math.floor(portal.level); }

function getZapDamage(portal) {
    const baseDamages = [0, 75, 125, 175, 238, 300, 400, 500, 600], // by portal level
        forceAmpDamageFactors = [1, 2, 2.5, 2.75, 2.875], // by number of force-amps
        turretAttackFrequency = [1, 2, 4, 6, 8], // attack-frequency by number of turrets (unused)
        turretAttackFactors = [1, 1.2, 1.4, 1.6, 1.8]; // attack-boost by number of turrets

    var level = Math.floor(portal.level),
        mods = portal.portalV2.linkedModArray;

    var numForceAmps=0, numTurrets=0;

    for(var i=0; i<4; i++) {
        var mod = mods[i];

        if(mod && mod.type === 'TURRET') { numTurrets++; }
        if(mod && mod.type === 'FORCE_AMP') { numForceAmps++; }
    }

//    console.log('lvl', level, 'base', baseDamages[level], 'amp', forceAmpDamageFactors[numForceAmps], 'tur', turretAttackFactors[numTurrets]);
    return baseDamages[level] * forceAmpDamageFactors[numForceAmps] * turretAttackFactors[numTurrets];
}

function getDefenseValue(portal) {
    var mods = portal.portalV2.linkedModArray,
        numLinks = portal.portalV2.linkedEdges.length;

    // calculations are according to ixotopp: http://goo.gl/9WPMN

    // 'best-fit' approximation based on data from the chart published by Brandon Badger
    var linkMitigation = Math.max(0, 18.6356 * Math.log(2.42032 * numLinks) / 100);

    // looks sound, don't have any idea how this came together…
    var shieldMitigation, shieldStr = '', tmp = 1;
    for(var i=0; i<4; i++) {
        var mod = mods[i];

        if(mod && mod.type === 'RES_SHIELD') {
            shieldStr += mod.rarity.charAt(0);
            tmp *= 1-(mod.stats.MITIGATION/100)
        }
    }
    shieldMitigation = 1-tmp;

//    console.log('mitigation: %.2f [shields (%s) – %.2f, %d links – %.2f]',
//        shieldMitigation+linkMitigation, shieldStr||'none', shieldMitigation,
//        numLinks, linkMitigation);

    return shieldMitigation + linkMitigation;
}


var setup =  _plugin.boot;

// PLUGIN END //////////////////////////////////////////////////////////


if(window.iitcLoaded && typeof setup === 'function') {
  setup();
} else {
  if(window.bootPlugins)
    window.bootPlugins.push(setup);
  else
    window.bootPlugins = [setup];
}
} // wrapper end
// inject code into site context
var script = document.createElement('script');
script.appendChild(document.createTextNode('('+ wrapper +')();'));
(document.body || document.head || document.documentElement).appendChild(script);

