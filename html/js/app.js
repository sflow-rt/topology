$(function() {
  var restPath = '../scripts/topology.js/';
  var topologyURL = restPath + 'topology/json';
  var statusURL = restPath + 'status/json';
  var locateURL = restPath + 'locate/json';

  function setNav(target) {
    $('.navbar .nav-item a[href="'+target+'"]').parent().addClass('active').siblings().removeClass('active');
    $(target).show().siblings().hide();
    window.sessionStorage.setItem('topology_nav',target);
    window.history.replaceState(null,'',target);
  }

  var hash = window.location.hash;
  if(hash && $('.navbar .nav-item a[href="'+hash+'"]').length == 1) setNav(hash);
  else setNav(window.sessionStorage.getItem('topology_nav') || $('.navbar .nav-item a').first().attr('href'));

  $('.navbar .nav-link').on('click', function(e) {
    var selected = $(this).attr('href');
    setNav(selected);
  });

  $('a[href^="#"]').on('click', function(e) {
    e.preventDefault();
  });

  function details() {
    var $this = $(this);
    var details = $this.data('details');
    if(details && details.length) {
      var dialog = $('#details-dialog');
      dialog.find('.modal-title').html($this.find('.title').html());
      dialog.find('.modal-body').html(details.join(', '));
      dialog.modal('show');
    }
  }
  var m_nodes_total = $('#nodes-total').gauge({label:'Nodes Total', suffix: '', threshold: 4000, maxValue: 5000, logScale:true });
  var m_nodes_unmonitored = $('#nodes-unmonitored').gauge({label:'Nodes Unmonitored', suffix: '', threshold: 1, maxValue: 1}).click(details);
  var m_nodes_no_flows = $('#nodes-no-flows').gauge({label:'Nodes No Flows', suffix: '', threshold: 1, maxValue: 1}).click(details);
  var m_links_total = $('#links-total').gauge({label:'Links Total', suffix: '', threshold: 8000, maxValue: 10000, logScale: true});
  var m_links_unmonitored = $('#links-unmonitored').gauge({label:'Links Unmonitored', suffix: '', threshold: 1, maxValue: 1}).click(details);
  var m_links_down = $('#links-down').gauge({label:'Links Down', suffix: '', threshold: 1, maxValue: 1}).click(details);

  function updateStatus(metrics) {
    m_nodes_total.gauge('update', {value: metrics.nodes.total});
    m_nodes_unmonitored.gauge('update', {value: metrics.nodes.total - metrics.nodes.monitored, maxValue: metrics.nodes.total}).data('details',metrics.nodes.details.unmonitored);
    m_nodes_no_flows.gauge('update', {value: metrics.nodes.noflows, maxValue: metrics.nodes.total}).data('details',metrics.nodes.details.noflows);
    m_links_total.gauge('update', {value: metrics.links.total});
    m_links_unmonitored.gauge('update', {value: metrics.links.total - metrics.links.monitored, maxValue: metrics.links.total}).data('details',metrics.links.details.unmonitored);
    m_links_down.gauge('update', {value: metrics.links.down, maxValue: metrics.links.total}).data('details',metrics.links.details.down);
  }

  $('#locateForm').submit(function( event ) {
    event.preventDefault();
    $('#location').hide();
    var address = $.trim($('#networkAddress').removeClass('is-invalid').val());
    var query = address ? { address: address} : null;
    $.ajax({
      url: locateURL,
      type: 'GET',
      data: query,
      contentType: 'application/json',
      success: function(resp) {
        var rows;
        if(resp && resp.length > 0) {
          var rows = '';
          for(var i = 0; i < resp.length; i++) {
            rows += '<tr>';
            rows += '<td>' + (resp[i].node || '') + '</td>'; 
            rows += '<td>' + (resp[i].port || '') + '</td>';
            rows += '<td>' + (resp[i].agent || '') + '</td>';
            rows += '<td>' + (resp[i].ifindex || '') + '</td>';
            rows += '<td>' + (resp[i].mac || '') + '</td>';
            rows += '</tr>';
          }
          $('#location tbody').html(rows);
          $('#location').show();
        } else {
          $('#networkAddress').addClass('is-invalid');
        }
      },
      error: function() {
        $('#networkAddress').addClass('is-invalid');
      }  
    });
  });

  $('#topologyFile').change(function(event) {
    var input = event.target;
    var $input = $(input);
    $input.removeClass('is-valid').removeClass('is-invalid');
    var file = input.files[0];
    var label = input.nextElementSibling;
    label.innerText = file.name;
    var reader = new FileReader();
    reader.onload = function() {
      var text = reader.result;
      $.ajax({
        url: topologyURL,
        type: 'POST',
        contentType: 'application/json',
        data: text,
        success: function() { $input.addClass('is-valid'); },
        error: function() { $input.addClass('is-invalid'); } 
      });
    }
    reader.readAsText(file);
  });

  (function pollStatus() {
    $.ajax({
      url: statusURL,
      dataType: 'json',
      success: function(data) {
        updateStatus(data);
      },
      error: function() {
        $('.gauge').addClass('warn');
      },
      complete: function() {
        setTimeout(pollStatus, 5000);
      },
      timeout: 60000
    });
  })();
});
