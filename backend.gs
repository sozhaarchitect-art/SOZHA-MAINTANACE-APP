/**
 * GOOGLE APPS SCRIPT FOR SOZHA MAINTENANCE (v2.3 - ULTRA SYNC)
 * FIX: This version FORCEFULLY fixes the "Missing Balance Column" issue.
 * 
 * INSTRUCTIONS:
 * 1. Delete ALL old code in Apps Script.
 * 2. Paste this ENTIRE code.
 * 3. Click SAVE.
 * 4. Click DEPLOY > NEW DEPLOYMENT > WEB APP > ANYONE > DEPLOY.
 */

function testEmail() {
  var userEmail = "sozhaarchitect@gmail.com";
  MailApp.sendEmail(userEmail, "SOZHA Test Email", "If you received this, Sozha has permission to send emails from your account.");
  Logger.log("Test email sent to: " + userEmail);
}

function doGet(e) {
  if (!e || !e.parameter) {
    return ContentService.createTextOutput("SOZHA Backend is Online. (Note: This function cannot be run manually from the editor)").setMimeType(ContentService.MimeType.TEXT);
  }
  var action = e.parameter.action;
  var id = e.parameter.id;
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  if (action === 'getProject') {
    var sheet = spreadsheet.getSheetByName('Projects');
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString() === id) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success', 
          data: {
            id: data[i][0],
            name: data[i][1],
            client: data[i][2],
            clientEmail: data[i][3],
            type: data[i][4],
            status: data[i][5],
            totalCost: data[i][6],
            paidAmount: data[i][7],
            balance: data[i][8],
            currentStage: data[i][9],
            notes: data[i][10],
            lastUpdate: data[i][11],
            designUrl: data[i][12]
          }
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  if (action === 'getMeetings') {
    var sheet = spreadsheet.getSheetByName('Meetings');
    if (!sheet) return ContentService.createTextOutput(JSON.stringify({status: 'success', data: []})).setMimeType(ContentService.MimeType.JSON);
    var data = sheet.getDataRange().getValues();
    var meetings = [];
    for (var i = 1; i < data.length; i++) {
      meetings.push({
        id: data[i][0],
        title: data[i][1],
        start: data[i][2],
        end: data[i][3],
        description: data[i][4],
        projectId: data[i][5]
      });
    }
    return ContentService.createTextOutput(JSON.stringify({status: 'success', data: meetings})).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'getProjects') {
    var sheet = spreadsheet.getSheetByName('Projects');
    if (!sheet) return ContentService.createTextOutput(JSON.stringify({status: 'success', data: []})).setMimeType(ContentService.MimeType.JSON);
    var data = sheet.getDataRange().getValues();
    var projects = [];
    for (var i = 1; i < data.length; i++) {
      projects.push({
        id: data[i][0],
        name: data[i][1],
        client: data[i][2],
        clientEmail: data[i][3],
        type: data[i][4],
        status: data[i][5],
        totalCost: data[i][6],
        paidAmount: data[i][7],
        balance: data[i][8],
        currentStage: data[i][9],
        notes: data[i][10],
        lastUpdate: data[i][11],
        designUrl: data[i][12]
      });
    }
    return ContentService.createTextOutput(JSON.stringify({status: 'success', data: projects})).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({status: 'error', message: 'Not found'}))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  if (!e || !e.postData) {
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: 'No data received. This function cannot be run manually.'})).setMimeType(ContentService.MimeType.JSON);
  }
  logToSheet('--- NEW POST REQUEST RECEIVED ---');
  
  var body;
  try {
    body = JSON.parse(e.postData.contents);
    logToSheet('Action Triggered: ' + body.action);
  } catch (err) {
    logToSheet('CRITICAL ERROR: Failed to parse request body. Error: ' + err.toString());
    logToSheet('Raw Context: ' + JSON.stringify(e.postData.contents));
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: 'Invalid JSON'}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var action = body.action;
  var data = body.data;
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  setup();

  if (action === 'addProject' || action === 'updateProject' || action === 'deleteProject') {
    var sheet = spreadsheet.getSheetByName('Projects');
    if (action === 'addProject') {
      var project = data.project || data;
      var baseUrl = data.baseUrl;
      
      var total = project ? (Number(project.totalCost) || 0) : 0;
      var paid = project ? (Number(project.paidAmount) || 0) : 0;
      var balance = total - paid;

      sheet.appendRow([project.id, project.name, project.client, project.clientEmail, project.type, project.status, total, paid, balance, project.currentStage, project.notes, project.lastUpdate, project.designUrl]);
      
      if (baseUrl) {
        logToSheet('Project added. Sending "Started" email to: ' + project.name);
        sendProjectLink(project, baseUrl);
      }
      
      return ContentService.createTextOutput(JSON.stringify({status: 'success'})).setMimeType(ContentService.MimeType.JSON);
    }

    var rows = sheet.getDataRange().getValues();
    var project = data;
    var targetId = (project && typeof project === 'object') ? project.id : project;
    
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0].toString() === targetId.toString()) {
        if (action === 'deleteProject') {
          sheet.deleteRow(i + 1);
        } else {
          var total = project ? (Number(project.totalCost) || 0) : 0;
          var paid = project ? (Number(project.paidAmount) || 0) : 0;
          var balance = total - paid;
          var oldStatus = rows[i][5];
          
          sheet.getRange(i + 1, 1, 1, 13).setValues([[project.id, project.name, project.client, project.clientEmail, project.type, project.status, total, paid, balance, project.currentStage, project.notes, project.lastUpdate, project.designUrl]]);
          
          if (project.status === 'Completed' && oldStatus !== 'Completed') {
            logToSheet('Status changed to Completed for: ' + project.name + '.');
          } else {
            logToSheet('Project updated: ' + project.name);
          }
        }
        return ContentService.createTextOutput(JSON.stringify({status: 'success'})).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  if (action === 'addMeeting' || action === 'updateMeeting' || action === 'deleteMeeting') {
    var sheet = spreadsheet.getSheetByName('Meetings');
    var meeting = data;

    if (action === 'addMeeting') {
      sheet.appendRow([meeting.id, meeting.title, meeting.start, meeting.end, meeting.description, meeting.projectId]);
      return ContentService.createTextOutput(JSON.stringify({status: 'success'})).setMimeType(ContentService.MimeType.JSON);
    }

    var rows = sheet.getDataRange().getValues();
    var targetId = (meeting && typeof meeting === 'object') ? meeting.id : meeting;
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0].toString() === targetId.toString()) {
        if (action === 'deleteMeeting') {
          sheet.deleteRow(i + 1);
        } else {
          sheet.getRange(i + 1, 1, 1, 6).setValues([[meeting.id, meeting.title, meeting.start, meeting.end, meeting.description, meeting.projectId]]);
        }
        return ContentService.createTextOutput(JSON.stringify({status: 'success'})).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  if (action === 'sendProjectLink') {
    var project = data.project || data;
    var baseUrl = data.baseUrl;
    var message = data.message || '';
    if (project && baseUrl) {
      logToSheet('Manual request: Sending project link to ' + project.clientEmail);
      sendProjectLink(project, baseUrl, message);
      return ContentService.createTextOutput(JSON.stringify({status: 'success', message: 'Email sent'})).setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService.createTextOutput(JSON.stringify({status: 'error', message: 'Missing project or baseUrl'})).setMimeType(ContentService.MimeType.JSON);
    }
  }
}



function checkAndSendPaymentReminders() {
  logToSheet('--- STARTING DAILY PAYMENT REMINDER CHECK ---');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var meetingSheet = ss.getSheetByName('Meetings');
  var projectSheet = ss.getSheetByName('Projects');
  
  if (!meetingSheet || !projectSheet) {
    logToSheet('ERROR: Meetings or Projects sheet not found.');
    return;
  }

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  
  var meetingData = meetingSheet.getDataRange().getValues();
  var projectData = projectSheet.getDataRange().getValues();
  var sentCount = 0;

  for (var i = 1; i < meetingData.length; i++) {
    var meetingDate = new Date(meetingData[i][2]); // Start Time Column
    meetingDate.setHours(0, 0, 0, 0);

    if (meetingDate.getTime() === today.getTime()) {
      var projectId = meetingData[i][5]; // Project ID Column
      logToSheet('Found meeting today for Project ID: ' + projectId);

      // Find project details
      for (var j = 1; j < projectData.length; j++) {
        if (projectData[j][0].toString() === projectId.toString()) {
          var project = {
            id: projectData[j][0],
            name: projectData[j][1],
            client: projectData[j][2],
            clientEmail: projectData[j][3],
            totalCost: projectData[j][6],
            paidAmount: projectData[j][7],
            balance: projectData[j][8],
            currentStage: projectData[j][9]
          };

          if (project.clientEmail) {
            sendPaymentReminder(project);
            sentCount++;
          } else {
            logToSheet('SKIPPING: No email for project ' + project.name);
          }
          break;
        }
      }
    }
  }
  logToSheet('FINISHED: Sent ' + sentCount + ' payment reminders.');
}

function sendPaymentReminder(project) {
  var balance = Number(project.totalCost) - Number(project.paidAmount);
  var subject = 'Payment Status Update: ' + project.name + ' | SOZHA';
  
  var htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; border: 1px solid #c5a059;">
      <div style="background-color: #0a0a0a; padding: 20px; text-align: center;">
        <h1 style="color: #c5a059; margin: 0; letter-spacing: 2px;">SOZHA</h1>
        <p style="color: #888; margin: 5px 0 0 0; font-size: 12px; text-transform: uppercase;">Architecture & Maintenance</p>
      </div>
      <div style="padding: 30px 20px;">
        <h2 style="color: #0a0a0a; border-bottom: 2px solid #c5a059; padding-bottom: 10px;">Scheduled Payment Summary</h2>
        <p>Dear <strong>${project.client}</strong>,</p>
        <p>This is an automated update regarding the financial status of your project "<strong>${project.name}</strong>" as scheduled for today.</p>
        
        <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #c5a059; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Current Stage:</strong> ${project.currentStage || 'N/A'}</p>
          <p style="margin: 5px 0;"><strong>Total project Cost:</strong> ₹${Number(project.totalCost).toLocaleString()}</p>
          <p style="margin: 5px 0;"><strong>Total Paid:</strong> ₹${Number(project.paidAmount).toLocaleString()}</p>
          <p style="margin: 5px 0; color: ${balance > 0 ? '#d32f2f' : '#388e3c'}; font-size: 18px;"><strong>Balance Due:</strong> ₹${balance.toLocaleString()}</p>
        </div>

        <div style="background-color: #1a1a1a; padding: 30px; border-radius: 12px; text-align: center; margin: 30px 0; border: 1px solid #c5a059;">
          <h3 style="color: #ffffff; margin-top: 0; font-size: 18px; letter-spacing: 1px;">Client Access QR</h3>
          <div style="background: white; padding: 10px; border-radius: 8px; display: inline-block; margin-bottom: 15px;">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent('https://sozha.vercel.app/client.html?id=' + project.id)}" alt="Client Access QR" style="display: block; width: 150px; height: 150px;">
          </div>
          <p style="font-size: 12px; color: #888; margin-bottom: 20px;">Scan to view project status & details</p>
          <a href="https://sozha.vercel.app/client.html?id=${project.id}" style="background-color: #c5a059; color: #000; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 14px;">View Project Dashboard</a>
        </div>
        
        <p>Please ensure all payments are up to date to avoid any delays in the project timeline.</p>
        <p style="margin-top: 30px;">Best regards,</p>
        <p><strong>The SOZHA Team</strong><br>
        <small style="color: #888;">SOZHAARCHITECT@GMAIL.COM</small></p>
      </div>
      <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 11px; color: #999;">
        Copyright &copy; ${new Date().getFullYear()} SOZHA. All rights reserved.
      </div>
    </div>
  `;

  try {
    MailApp.sendEmail(project.clientEmail, subject, '', {
      htmlBody: htmlBody,
      name: 'SOZHA ARCHITECT',
      replyTo: 'sozhaarchitect@gmail.com'
    });
    logToSheet('SUCCESS: Payment reminder sent to ' + project.clientEmail);
  } catch (e) {
    logToSheet('CRITICAL ERROR: Failed to send payment reminder to ' + project.clientEmail + '. Error: ' + e.toString());
  }
}

function sendProjectLink(project, baseUrl, customMessage) {
  if (!project.clientEmail) {
    logToSheet('ERROR: No email for project ' + project.name);
    return;
  }

  var clientUrl = baseUrl.replace('index.html', '').replace('dashboard.html', '') + 'client.html?id=' + project.id;
  var qrImageUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(clientUrl);
  
  var subject = 'Project Status Update: ' + project.name + ' | SOZHA';
  var htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; border: 1px solid #c5a059;">
      <div style="background-color: #0a0a0a; padding: 20px; text-align: center;">
        <h1 style="color: #c5a059; margin: 0; letter-spacing: 2px;">SOZHA</h1>
        <p style="color: #888; margin: 5px 0 0 0; font-size: 12px; text-transform: uppercase;">Architecture & Maintenance</p>
      </div>
      <div style="padding: 30px 20px;">
        <h2 style="color: #0a0a0a; border-bottom: 2px solid #c5a059; padding-bottom: 10px;">Project Status Update</h2>
        <p>Dear <strong>${project.client}</strong>,</p>
        <p>We are writing to provide you with an update on your project: "<strong>${project.name}</strong>".</p>
        
        <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #c5a059; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Current Status:</strong> <span style="text-transform: uppercase; font-weight: bold; color: #c5a059;">${project.status}</span></p>
          <p style="margin: 5px 0;"><strong>Active Stage:</strong> ${project.currentStage || 'Initial Phase'}</p>
        </div>

        ${customMessage ? `<div style="margin: 20px 0; padding: 15px; background-color: #fff9e6; border: 1px dashed #c5a059; color: #555;">
          <strong>Message from SOZHA:</strong><br>
          ${customMessage}
        </div>` : ''}

        <p>You can track real-time progress, view designs, and check financial details through your personal dashboard.</p>

        <div style="background-color: #1a1a1a; padding: 30px; border-radius: 12px; text-align: center; margin: 30px 0; border: 1px solid #c5a059;">
          <h3 style="color: #ffffff; margin-top: 0; font-size: 18px; letter-spacing: 1px;">Client Access QR</h3>
          <div style="background: white; padding: 10px; border-radius: 8px; display: inline-block; margin-bottom: 15px;">
            <img src="${qrImageUrl}" alt="Client Access QR" style="display: block; width: 150px; height: 150px;">
          </div>
          <p style="font-size: 12px; color: #888; margin-bottom: 20px;">Scan to view project status</p>
          <a href="${clientUrl}" style="background-color: #c5a059; color: #000; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 14px;">View Project Dashboard</a>
        </div>

        <p>Thank you for choosing SOZHA.</p>
        <p style="margin-top: 30px;">Best regards,</p>
        <p><strong>The SOZHA Team</strong><br>
        <small style="color: #888;">SOZHAARCHITECT@GMAIL.COM</small></p>
      </div>
      <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 11px; color: #999;">
        Copyright &copy; ${new Date().getFullYear()} SOZHA. All rights reserved.
      </div>
    </div>
  `;

  try {
    MailApp.sendEmail(project.clientEmail, subject, '', {
      htmlBody: htmlBody,
      name: 'SOZHA ARCHITECT',
      replyTo: 'sozhaarchitect@gmail.com'
    });
    logToSheet('SUCCESS: Client update email sent to ' + project.clientEmail);
    Logger.log('SUCCESS: Client update email sent to ' + project.clientEmail);
  } catch (e) {
    logToSheet('CRITICAL ERROR: Failed to send project update email to ' + project.clientEmail + '. Error: ' + e.toString());
    Logger.log('CRITICAL ERROR: Failed to send project update email to ' + project.clientEmail + '. Error: ' + e.toString());
  }
}

function logToSheet(message) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('SystemLogs');
    if (!sheet) {
      sheet = ss.insertSheet('SystemLogs');
      sheet.appendRow(['Timestamp', 'Log Message']);
    }
    sheet.appendRow([new Date(), message]);
  } catch (e) {
    console.error('Logging failed: ' + e.toString());
  }
}





function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Setup Projects Sheet
  var projectSheet = ss.getSheetByName('Projects');
  if (!projectSheet) {
    var firstSheet = ss.getSheets()[0];
    if (firstSheet.getName() === 'Sheet1') {
      firstSheet.setName('Projects');
      projectSheet = firstSheet;
    } else {
      projectSheet = ss.insertSheet('Projects');
    }
  }
  
  var projectHeaders = ['ID', 'Project Name', 'Client Name', 'Client Email', 'Type', 'Status', 'Total Cost', 'Paid Amount', 'Balance Amount', 'Current Stage', 'Notes', 'Last Update', 'Design URL'];
  if (projectSheet.getLastRow() === 0) {
    projectSheet.appendRow(projectHeaders);
  } else {
    projectSheet.getRange(1, 1, 1, 13).setValues([projectHeaders]);
  }

  // Setup Meetings Sheet
  var meetingSheet = ss.getSheetByName('Meetings');
  if (!meetingSheet) {
    meetingSheet = ss.insertSheet('Meetings');
  }
  
  var meetingHeaders = ['ID', 'Title', 'Start Time', 'End Time', 'Description', 'Project ID'];
  if (meetingSheet.getLastRow() === 0) {
    meetingSheet.appendRow(meetingHeaders);
  } else {
    meetingSheet.getRange(1, 1, 1, 6).setValues([meetingHeaders]);
  }

  // Setup Log Sheet
  var logSheet = ss.getSheetByName('SystemLogs');
  if (!logSheet) {
    logSheet = ss.insertSheet('SystemLogs');
    logSheet.appendRow(['Timestamp', 'Log Message']);
  }
}
