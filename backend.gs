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
    <div style="font-family: 'Inter', 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; color: #ffffff; background-color: #0a0a0a; border: 1px solid #c5a059; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
      <!-- Header -->
      <div style="background-color: #141414; padding: 40px 20px; text-align: center; border-bottom: 1px solid rgba(197, 160, 89, 0.2);">
        <h1 style="color: #c5a059; margin: 0; letter-spacing: 4px; font-weight: 800; text-transform: uppercase; font-size: 28px;">SOZHA</h1>
        <p style="color: #a0a0a0; margin: 10px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">Architecture • Maintenance • Design</p>
      </div>

      <!-- Content -->
      <div style="padding: 40px 30px;">
        <h2 style="color: #c5a059; font-size: 20px; font-weight: 700; margin-bottom: 25px; border-left: 4px solid #c5a059; padding-left: 15px;">Payment Summary</h2>
        <p style="font-size: 16px; color: #e0e0e0; line-height: 1.6;">Dear <strong>${project.client}</strong>,</p>
        <p style="font-size: 15px; color: #a0a0a0; line-height: 1.6; margin-bottom: 30px;">We're providing an updated financial summary for your project: <span style="color: #ffffff;">"${project.name}"</span>.</p>
        
        <!-- Financial Card -->
        <div style="background-color: #1a1a1a; padding: 25px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.05); margin-bottom: 35px;">
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #a0a0a0; font-size: 14px;">Current Stage</span>
              <span style="color: #ffffff; font-weight: 600;">${project.currentStage || 'Process Ongoing'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #a0a0a0; font-size: 14px;">Total Cost</span>
              <span style="color: #ffffff; font-weight: 600;">₹${Number(project.totalCost).toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #a0a0a0; font-size: 14px;">Amount Paid</span>
              <span style="color: #4CAF50; font-weight: 600;">₹${Number(project.paidAmount).toLocaleString()}</span>
            </div>
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed rgba(197, 160, 89, 0.3); display: flex; justify-content: space-between;">
              <span style="color: #c5a059; font-weight: 700; font-size: 16px;">Balance Due</span>
              <span style="color: #ff4444; font-weight: 800; font-size: 20px;">₹${balance.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <!-- QR/Access Section -->
        <div style="background: linear-gradient(145deg, #1a1a1a 0%, #0a0a0a 100%); padding: 35px 20px; border-radius: 12px; text-align: center; border: 1px solid #c5a059;">
          <p style="color: #ffffff; margin-top: 0; font-size: 15px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px;">Client Dashboard Access</p>
          <div style="background: white; padding: 15px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 15px rgba(197, 160, 89, 0.3);">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent('https://sozha.vercel.app/client.html?id=' + project.id)}" alt="Dashboard QR" style="display: block; width: 150px; height: 150px;">
          </div>
          <p style="font-size: 12px; color: #a0a0a0; margin: 15px 0 25px 0;">Scan this code to view project status & detailed breakdown.</p>
          <a href="https://sozha.vercel.app/client.html?id=${project.id}" style="background-color: #c5a059; color: #000000; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 800; display: inline-block; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Open Dashboard</a>
        </div>
        
        <p style="font-size: 14px; color: #888; text-align: center; margin-top: 30px;">Maintain a clear balance for uninterrupted project progress.</p>
      </div>

      <!-- Footer -->
      <div style="background-color: #141414; padding: 25px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.05);">
        <p style="margin: 0; font-weight: 700; color: #c5a059; font-size: 14px;">The SOZHA Team</p>
        <p style="margin: 5px 0 0 0; color: #666; font-size: 11px;">sozhaarchitect@gmail.com</p>
        <p style="margin: 20px 0 0 0; color: #444; font-size: 10px; text-transform: uppercase;">© ${new Date().getFullYear()} SOZHA Architecture & Maintenance</p>
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
    <div style="font-family: 'Inter', 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; color: #ffffff; background-color: #0a0a0a; border: 1px solid #c5a059; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
      <!-- Header -->
      <div style="background-color: #141414; padding: 40px 20px; text-align: center; border-bottom: 1px solid rgba(197, 160, 89, 0.2);">
        <h1 style="color: #c5a059; margin: 0; letter-spacing: 4px; font-weight: 800; text-transform: uppercase; font-size: 28px;">SOZHA</h1>
        <p style="color: #a0a0a0; margin: 10px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">Architecture • Maintenance • Design</p>
      </div>

      <!-- Content -->
      <div style="padding: 40px 30px;">
        <h2 style="color: #c5a059; font-size: 20px; font-weight: 700; margin-bottom: 25px; border-left: 4px solid #c5a059; padding-left: 15px;">Project Status Update</h2>
        <p style="font-size: 16px; color: #e0e0e0; line-height: 1.6;">Dear <strong>${project.client}</strong>,</p>
        <p style="font-size: 15px; color: #a0a0a0; line-height: 1.6;">We're sharing the latest progress update for your project: <span style="color: #ffffff;">"${project.name}"</span>.</p>
        
        <!-- Status Info -->
        <div style="background-color: #1a1a1a; padding: 25px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.05); margin: 30px 0;">
          <div style="margin-bottom: 15px;">
            <span style="color: #a0a0a0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Current Status</span>
            <div style="color: #c5a059; font-size: 18px; font-weight: 800; text-transform: uppercase; margin-top: 5px;">${project.status}</div>
          </div>
          <div>
            <span style="color: #a0a0a0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Active Phase</span>
            <div style="color: #ffffff; font-size: 16px; font-weight: 600; margin-top: 5px;">${project.currentStage || 'Initial Design'}</div>
          </div>
        </div>

        ${customMessage ? `
        <div style="margin: 30px 0; padding: 20px; background-color: rgba(197, 160, 89, 0.05); border: 1px dashed #c5a059; border-radius: 8px; color: #d0d0d0; font-style: italic; line-height: 1.6;">
          <strong style="color: #c5a059; font-style: normal; display: block; margin-bottom: 5px;">A message from our team:</strong>
          "${customMessage}"
        </div>` : ''}

        <p style="color: #a0a0a0; font-size: 14px; margin-bottom: 30px;">For real-time designs, documents, and financial tracking, access your secure dashboard below.</p>

        <!-- QR/Access Section -->
        <div style="background: linear-gradient(145deg, #1a1a1a 0%, #0a0a0a 100%); padding: 35px 20px; border-radius: 12px; text-align: center; border: 1px solid #c5a059;">
          <p style="color: #ffffff; margin-top: 0; font-size: 15px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px;">Secure Client QR</p>
          <div style="background: white; padding: 15px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 15px rgba(197, 160, 89, 0.3);">
            <img src="${qrImageUrl}" alt="Dashboard QR" style="display: block; width: 150px; height: 150px;">
          </div>
          <p style="font-size: 12px; color: #a0a0a0; margin: 15px 0 25px 0;">Scan to view your digital project board.</p>
          <a href="${clientUrl}" style="background-color: #c5a059; color: #000000; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 800; display: inline-block; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">View Dashboard</a>
        </div>
      </div>

      <!-- Footer -->
      <div style="background-color: #141414; padding: 25px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.05);">
        <p style="margin: 0; font-weight: 700; color: #c5a059; font-size: 14px;">The SOZHA Team</p>
        <p style="margin: 5px 0 0 0; color: #666; font-size: 11px;">sozhaarchitect@gmail.com</p>
        <p style="margin: 20px 0 0 0; color: #444; font-size: 10px; text-transform: uppercase;">© ${new Date().getFullYear()} SOZHA Architecture • India</p>
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
