/**
 * Importa avisos bancarios de Gmail a EuroVic.
 * Configura EUROVIC_ENDPOINT, EUROVIC_SECRET y GMAIL_QUERY en las propiedades
 * del proyecto de Apps Script antes de ejecutar instalarTrigger().
 */
function importarCorreosBancarios() {
  var props = PropertiesService.getScriptProperties();
  var endpoint = props.getProperty('EUROVIC_ENDPOINT');
  var secret = props.getProperty('EUROVIC_SECRET');
  var query = props.getProperty('GMAIL_QUERY');
  var bankSender = props.getProperty('BANK_SENDER');
  if (!endpoint || !secret || !query || !bankSender) {
    throw new Error('Configura EUROVIC_ENDPOINT, EUROVIC_SECRET, GMAIL_QUERY y BANK_SENDER en las propiedades del script.');
  }

  var procesados = GmailApp.getUserLabelByName('EuroVic-Procesados') || GmailApp.createLabel('EuroVic-Procesados');
  var hilos = GmailApp.search('(' + query + ') -label:EuroVic-Procesados', 0, 50);

  hilos.forEach(function(hilo) {
    var todoCorrecto = true;
    hilo.getMessages().forEach(function(mensaje) {
      if (!todoCorrecto || mensaje.isDraft()) return;
      // Gmail devuelve hilos completos: solo se envían mensajes del remitente bancario indicado.
      if (mensaje.getFrom().toLowerCase().indexOf(bankSender.toLowerCase()) === -1) return;
      var payload = {
        message_id: mensaje.getId(),
        from: mensaje.getFrom(),
        subject: mensaje.getSubject(),
        date: mensaje.getDate().toISOString(),
        text: mensaje.getPlainBody().slice(0, 30000)
      };

      try {
        var respuesta = UrlFetchApp.fetch(endpoint, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'X-Eurovic-Secret': secret },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
        var status = respuesta.getResponseCode();
        if (status < 200 || status >= 300) {
          todoCorrecto = false;
          console.error('EuroVic respondió HTTP ' + status + ' para un correo; se volverá a intentar.');
        }
      } catch (error) {
        todoCorrecto = false;
        console.error('No se pudo enviar un correo a EuroVic: ' + error.message);
      }
    });

    if (todoCorrecto) hilo.addLabel(procesados);
  });
}

function instalarTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function(trigger) { return trigger.getHandlerFunction() === 'importarCorreosBancarios'; })
    .forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });

  ScriptApp.newTrigger('importarCorreosBancarios')
    .timeBased()
    .everyMinutes(5)
    .create();
}
