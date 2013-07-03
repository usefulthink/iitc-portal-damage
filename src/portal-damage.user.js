// ==UserScript==
// @id             iitc-portal-damage@usefluthink
// @name           IITC plugin: Portal-Damage
// @category       Layer
// @version        0.1.0.@@DATETIMEVERSION@@-alpha1
// @namespace      https://github.com/jonatkins/ingress-intel-total-conversion
// @updateURL      @@UPDATEURL@@
// @downloadURL    @@DOWNLOADURL@@
// @description    [@@BUILDDATE@@] Visualizes Portal-Damage (zap-range, -intensity and mitigation)
// @include        https://www.ingress.com/intel*
// @include        http://www.ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// @grant          none
// ==/UserScript==

@@PLUGINSTART@@

// PLUGIN START ////////////////////////////////////////////////////////

// use own namespace for plugin

var _plugin = window.plugin.portalDamage = function() {};

var resLayerGroup = null,
    enlLayerGroup = null;


// ------ INTIALIZATION

_plugin.boot = function() {
    resLayerGroup = _plugin.resLayerGroup = new L.FeatureGroup();
    enlLayerGroup = _plugin.enlLayerGroup = new L.FeatureGroup();

    //add the layer
    window.addLayerGroup('Portal Damage (Resistance)', resLayerGroup, false);
    window.addLayerGroup('Portal Damage (Enlightened)', enlLayerGroup, false);
};



// ------ PLUGIN EVENT-BINDINGS

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


    // color- (hue) and opacity-mapping by damage (curve-fitting by http://zunzun.com/)
    var d = portalDetails.zapDamage, dSq = d*d;
    hue = Math.min(50, Math.max(0, 49.2 - 6.54e-2*d + 2.2e-5*dSq));
    opacityFactor = Math.min(1, Math.max(0, 2.75e-2 + 1.755e-3*d - 7.5e-7*dSq));

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

    // store for later use with the portal
    portal._damagePath = path;

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
    // TODO: check if the corresponding damage-indicator needs to be redrawn
});


// portalDetailsUpdated: fired after the details in the sidebar have
//              been (re-)rendered Provides data about the portal that
//              has been selected.
window.addHook('portalDetailsUpdated', function(data) {
    // TODO: add defense-values to the sidebar-view
});



// ------ INTERNALS

function getZapRange(portal) { return 35 + 5*Math.floor(portal.level); }

function getZapDamage(portal) {
    const baseDamages = [0, 75, 125, 175, 238, 300, 400, 500, 600], // by portal level
        forceAmpDamageFactors = [1, 2, 2.5, 2.75, 2.875], // by number of force-amps
        turretAttackFrequency = [1, 2, 4, 6, 8], // attack-frequency by number of turrets (unused)
        turretAttackFactors = [1, 1.2, 1.4, 1.6, 1.8]; // attack-boost by number of turrets

    var level = Math.floor(portal.level),
        mods = portal.portalV2.linkedModArray,

        numForceAmps=0, numTurrets=0;

    for(var i=0; i<4; i++) {
        var mod = mods[i];

        if(mod && mod.type === 'TURRET') { numTurrets++; }
        if(mod && mod.type === 'FORCE_AMP') { numForceAmps++; }
    }

    return baseDamages[level] * forceAmpDamageFactors[numForceAmps] * turretAttackFactors[numTurrets];
}

// defense-calculation adopted from ixotopp: http://goo.gl/9WPMN
function getDefenseValue(portal) {
    var mods = portal.portalV2.linkedModArray,
        numLinks = portal.portalV2.linkedEdges.length,

        linkMitigation, shieldMitigation;

    // 'best-fit' approximation based on data from the chart published by Brandon Badger
    linkMitigation = Math.max(0, 18.6356 * Math.log(2.42032 * numLinks) / 100);

    // looks sound, don't have any idea how this came together…
    var tmp = 1;
    for(var i=0; i<4; i++) {
        var mod = mods[i];

        if(mod && mod.type === 'RES_SHIELD') { tmp *= 1-(mod.stats.MITIGATION/100); }
    }
    shieldMitigation = 1-tmp;

    return shieldMitigation + linkMitigation;
}


var setup =  _plugin.boot;

// PLUGIN END //////////////////////////////////////////////////////////

@@PLUGINEND@@
