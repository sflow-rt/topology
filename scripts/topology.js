// author: InMon Corp.
// version: 1.0
// date: 1/22/2021
// description: Persist Topology
// copyright: Copyright (c) 2021 InMon Corp. ALL RIGHTS RESERVED

var version = -1;

function setVersion(newVersion) {
  version = newVersion;
  logInfo("topology version " + version);
}

function getVersion() {
  return version;
}

function updateTopology(top,save) {
  if(top && setTopology(top)) {
    if(save) storeSet('topology', getTopology());
    setVersion(topologyVersion());
    return true;
  }
  return false;
}

updateTopology(storeGet('topology'),false);

setIntervalHandler(function(now) {
  var currentVersion = topologyVersion();
  if('number' === typeof currentVersion && currentVersion !== getVersion()) {
    storeSet('topology', getTopology());
    setVersion(currentVersion);
  }
});

function getMetrics() {
  var result = {links:{},nodes:{}};
  var links = topologyLinkNames() || [];
  result.links.total = links.length;
  result.links.monitored = 0;
  result.links.up = 0;
  result.links.down = 0;
  links.forEach(function(key) {
    let link_metrics = topologyLinkMetric(key,'ifadminstatus,ifoperstatus');
    if(link_metrics && link_metrics.length === 4) {
      if(link_metrics[0].agent && link_metrics[1].agent && link_metrics[2].agent && link_metrics[3].agent) {
        result.links.monitored++; 
        if('up' === link_metrics[0].metricValue && 'up' === link_metrics[1].metricValue && 'up' === link_metrics[2].metricValue && 'up' === link_metrics[3].metricValue) result.links.up++;
        else result.links.down++;
      }
    }
  });
  result.links.total = links.length;
  var nodes = topologyNodeNames() || [];
  result.nodes.total = nodes.length;
  result.nodes.monitored = 0;
  result.nodes.flows = 0;
  result.nodes.noflows = 0;
  nodes.forEach(function(key) {
    let agent = topologyAgentForNode(key);
    if(agent) {
      let agentMetrics = agents([agent])[agent];
      if(agentMetrics) {
        result.nodes.monitored++;
        if(agentMetrics.sFlowFlowSamples) result.nodes.flows++;
        else result.nodes.noflows++;
      }
    }
  });
  
  return result;
}

function locateAddress(addr) {
  if(/^([0-9]{1,3}\.){3}[\d]{1,3}$/.test(addr)) {
    return topologyLocateHostIP(addr);
  }
  if(/^([0-9A-Fa-f]{2}[:-]?){5}[0-9A-Fa-f]{2}$/.test(addr)) {
    return topologyLocateHostMac(addr.replace(/[:-]/g,'').toUpperCase());
  }
  if(/([0-9:A-Fa-f])*:([0-9:A-Fa-f])*$/.test(addr)) {
    return topologyLocateHostIP6(addr);
  }
  if(/^([a-zA-Z0-9]([-_a-zA-Z0-9]*[a-zA-Z0-9])?\.)*([a-zA-Z0-9][-_a-zA-Z0-9]*[a-zA-Z0-9])?$/.test(addr)) {
    try { 
      addrs = dnsGetAllByName(addr);
      if(addrs && addrs.length === 1) {
        return locateAddress(addrs[0]);
      }
    } catch(err) {
      logInfo('cannot resolve ' + addr);
    }
  }
  return [];
}

setHttpHandler(function(req) {
  var result, address, path = req.path;
  if(!path || path.length === 0) throw "not_found";
   
  switch(path[0]) {
    case 'topology':
      switch(req.method) {
        case 'POST':
        case 'PUT':
          if(req.error) throw "bad_request";
          if(!updateTopology(req.body,true)) throw "bad_request";
          break;
        case 'GET':
          result = getTopology();
          break;
        default:
          throw "bad_request";
      }
      break;
    case 'version':
      result = getVersion();
      break;
    case 'metrics':
      result = getMetrics();
      break;
    case 'locate':
      address = req.query.address;
      if(address && address.length === 1) {
        result = locateAddress(address[0]);
      } else {
        throw "bad_request";
      }
      break;
    default: throw 'not_found';
  } 
  return result;
});
