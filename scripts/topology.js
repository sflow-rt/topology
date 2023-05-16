// author: InMon Corp.
// version: 1.3
// date: 5/16/2023
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

function getMetric(res, idx, defVal) {
  var val = defVal;
  if(res && res.length && res.length > idx && res[idx].hasOwnProperty('metricValue')) val = res[idx].metricValue;
  return val;
} 

function getStatus() {
  var result = {links:{},nodes:{},traffic:{}};
  var links = topologyLinkNames() || [];
  result.links.total = links.length;
  result.links.monitored = 0;
  result.links.up = 0;
  result.links.down = 0;
  result.links.details = {unmonitored:[],links_down:[]};
  links.forEach(function(key) {
    var link_metrics = topologyLinkMetric(key,'ifadminstatus,ifoperstatus');
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
  var nodes = topologyNodeNames() || [];
  result.nodes.total = nodes.length;
  result.nodes.monitored = 0;
  result.nodes.flows = 0;
  result.nodes.noflows = 0;
  result.nodes.details = {unmonitored:[],noflows:[]};
  nodes.forEach(function(key) {
    var agent = topologyAgentForNode(key);
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
  var edge = metric('EDGE','sum:ifspeed,sum:ifinoctets,sum:ifinpkts',{iftype:['ethernetCsmacd']});
  result.traffic.speed = getMetric(edge,0,0); 
  result.traffic.bps = getMetric(edge,1,0) * 8;
  result.traffic.pps = getMetric(edge,2,0);
  var topo = metric('TOPOLOGY','sum:ifindiscards,sum:ifoutdiscards,sum:ifinerrors,sum:ifouterrors' ,{iftype:['ethernetCsmacd']});
  result.traffic.discards = getMetric(topo,0,0) + getMetric(topo,1,0);
  result.traffic.errors = getMetric(topo,2,0) + getMetric(topo,3,0);
  
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

const prometheus_prefix = (getSystemProperty('prometheus.metric.prefix') || 'sflow_') + 'topology_';

function prometheusName(str) {
  return str.replace(/[^a-zA-Z0-9_]/g,'_');
}

function prometheus() {
  var status = getStatus();
  var result  = prometheus_prefix+'links{status="unmonitored"} ' + (status.links.total - status.links.monitored) + '\n';
  result += prometheus_prefix+'links{status="up"} ' + status.links.up + '\n';
  result += prometheus_prefix+'links{status="down"} ' + status.links.down + '\n';
  result += prometheus_prefix+'nodes{status="unmonitored"} ' + (status.nodes.total - status.nodes.monitored) + '\n';
  result += prometheus_prefix+'nodes{status="noflows"} ' + status.nodes.noflows + '\n';
  result += prometheus_prefix+'nodes{status="flows"} ' + status.nodes.flows + '\n';
  result += prometheus_prefix+'traffic_bps ' + status.traffic.bps + '\n';
  result += prometheus_prefix+'traffic_speed ' + status.traffic.speed + '\n';
  result += prometheus_prefix+'traffic_pps ' + status.traffic.pps + '\n';
  result += prometheus_prefix+'traffic_discards ' + status.traffic.discards + '\n';
  result += prometheus_prefix+'traffic_errors ' + status.traffic.errors + '\n';
  return result;
}

setHttpHandler(function(req) {
  var result, address, path = req.path;
  if(!path || path.length === 0) throw "not_found";
  if(path.length === 1 && 'prometheus' === path[0] && 'txt' === req.format) {
    return prometheus();
  }
  if('json' !== req.format) throw 'not_found'; 
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
    case 'prometheus':
      result = prometheus();
      break;
    default: throw 'not_found';
  } 
  return result;
});
