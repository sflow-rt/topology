// author: InMon Corp.
// version: 1.2
// date: 5/11/2023
// description: Persist Topology
// copyright: Copyright (c) 2021-2023 InMon Corp. ALL RIGHTS RESERVED

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

function getStatus() {
  var result = {links:{},nodes:{}};
  var links = topologyLinkNames() || [];
  result.links.total = links.length;
  result.links.monitored = 0;
  result.links.up = 0;
  result.links.down = 0;
  result.links.details = {unmonitored:[],links_down:[]};
  links.forEach(function(key) {
    let link_metrics = topologyLinkMetric(key,'ifadminstatus,ifoperstatus');
    if(link_metrics && link_metrics.length === 4) {
      if(link_metrics[0].agent && link_metrics[1].agent && link_metrics[2].agent && link_metrics[3].agent) {
        result.links.monitored++; 
        if('up' === link_metrics[0].metricValue && 'up' === link_metrics[1].metricValue && 'up' === link_metrics[2].metricValue && 'up' === link_metrics[3].metricValue) result.links.up++;
        else {
          result.links.down++;
          result.links.details.down.push(key);
        }
      } else {
        result.links.details.unmonitored.push(key);
      }
    } else {
      result.links.details.unmonitored.push(key);
    }
  });
  result.links.total = links.length;
  var nodes = topologyNodeNames() || [];
  result.nodes.total = nodes.length;
  result.nodes.monitored = 0;
  result.nodes.flows = 0;
  result.nodes.noflows = 0;
  result.nodes.details = {unmonitored:[],noflows:[]};
  nodes.forEach(function(key) {
    let agent = topologyAgentForNode(key);
    if(agent) {
      let agentMetrics = agents([agent])[agent];
      if(agentMetrics) {
        result.nodes.monitored++;
        if(agentMetrics.sFlowFlowSamples) result.nodes.flows++;
        else {
          result.nodes.noflows++;
          result.nodes.details.noflows.push(key);   
        }
      } else {
        result.nodes.details.unmonitored.push(key);
      }
    } else {
      result.nodes.details.unmonitored.push(key);
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

function getNodeMetric(agent,metricName,query) {
  var result = metric(agent,metricName,query);
  result.forEach(function(val) {
    var port = topologyInterfaceToPort(val.agent,val.dataSource) || {};
    if(port.node) val.node = port.node;
    if(port.port) val.port = port.port;
  });
  return result;
}

function getLinkMetric(linkName,metricName) {
  var result = topologyLinkMetric(linkName,metricName) || [];
  result.forEach(function(val) {
    var port = topologyInterfaceToPort(val.agent,val.dataSource) || {};
    if(port.node) val.node = port.node;
    if(port.port) val.port = port.port;
  });
  return result; 
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
    case 'status':
      result = getStatus();
      break;
    case 'locate':
      address = req.query.address || topologyLocatedHostMacs() || [];
      result = address.reduce((acc,addr) => acc.concat(locateAddress(addr)), []);
      break;
    case 'metric':
      if(path.length !== 4) throw "not_found";
      switch(path[1]) {
        case 'node':
          address = topologyAgentForNode(path[2]);
          if(!address) throw "not_found";
          result = getNodeMetric(address,path[3],req.query);
          break;
        case 'link':
          result = getLinkMetric(path[2],path[3]); 
          break;
        default:
          throw 'not_found';
      }
      break;
    default: throw 'not_found';
  } 
  return result;
});
