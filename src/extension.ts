import * as vscode from 'vscode'; 
var request = require('request');
var fs = require('fs');

var channelList = [];
var configuration = vscode.workspace.getConfiguration('slack');
var teamToken = configuration.get('teamToken'); 
var username = configuration.get('username');
var avatarUrl = configuration.get('avatarUrl');

var BASE_URL = 'https://slack.com/api/';
var API_CHANNELS = 'channels.list';
var API_USERS = 'users.list';
var API_GROUPS = 'groups.list';
var API_POST_MESSAGE = 'chat.postMessage';
var API_UPLOAD_FILES = 'files.upload';
var API_SET_SNOOZE = 'dnd.setSnooze';
var API_END_SNOOZE = 'dnd.endSnooze';
        
class Slack
{
     private _statusBarItem: vscode.StatusBarItem;   
     private savedChannel: string;
     
     private GetChannelList(callback, type:string, data)
     {  
        var params = '?token='+teamToken+'&exclude_archived=1';
        channelList.length = 0;
        var __request = function (urls, callback) {
            var results = {}, t = urls.length, c = 0,
                handler = function (error, response, body) {
                    var url = response.request.uri.href;
                    results[url] = { error: error, response: response, body: body };
                    if (++c === urls.length) { callback(results); }
                };
            while (t--) { request(urls[t], handler); }
        };
        
        var urls = [BASE_URL+API_CHANNELS+params, BASE_URL+API_GROUPS+params, BASE_URL+API_USERS+params];
        
        __request(urls, function(responses) {

            var url, response;
        
            for (url in responses) {
                // reference to the response object
                response = responses[url];

                // find errors
                if (response.error) {
                    console.log("Error", url, response.error);
                    return;
                }

                // render body
                if (response.body) {
                    let r = JSON.parse(response.body);

                    if(r.channels)
                    {
                        for(let i = 0; i < r.channels.length; i++) {
                            let c = r.channels[i];
                            channelList.push( { id : c.id, label : '#' + c.name } );
                        }       
                    }
                    
                    if(r.groups)
                    {
                        for(let i = 0; i < r.groups.length; i++) {
                            let c = r.groups[i];
                            channelList.push( { id : c.id, label : '#' + c.name, description : c.topic.value } );
                        }   
                    }
                    
                    if(r.members)
                    {
                        for(let i = 0; i < r.members.length; i++) {
                            let c = r.members[i];
                            channelList.push( { id : c.id, label : '@' + c.name, description : c.profile.real_name } );
                        }
                    }
                }
            }     
            
            callback && callback(type, data);
        }); 
     }
     
     private ApiCall(apiType:string, data?) {
         var that = this;
         
        if (!this._statusBarItem) { 
            this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left); 
        }
        
        request.post({
            url: BASE_URL+apiType, 
            formData: data
        }, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    switch(apiType) {
                        case API_SET_SNOOZE: case API_END_SNOOZE:
                            that._statusBarItem.text = "$(bell) Status set successfully!";
                            break;
                        case API_UPLOAD_FILES:
                            that._statusBarItem.text = "$(file-text) File sent successfully!";
                            break;
                        default:
                            that._statusBarItem.text = "$(comment) Message sent successfully!";
                            break;
                    }
                    that._statusBarItem.show(); 
                    setTimeout(function() { that._statusBarItem.hide()}, 5000 );
                }
        });
     }
     
     private QuickPick() {
       return vscode.window.showQuickPick(channelList, { matchOnDescription: true, placeHolder: 'Select a channel' }); 
     }
     
     private Send(type:string, data) {
            var sendMsg = function(type, data) {
                if(data) {
                    var s = new Slack();
                    s.ApiCall(type, data);                
                }
            }
            
            // sending a message to a specified channel/user/group
            if(data.channel) {
                sendMsg(type, data);
            }
            else {
                var slack = new Slack;
                var pick = slack.QuickPick();

                pick.then(item => {
                    if(item) {
                        data.channels = item.id;
                        data.channel = item.id;
                        sendMsg(type, data);
                    }
                });
            }
     }
     
     // Upload file from path
     public UploadFilePath() {
        var options = {
            prompt: "Please enter a path"
        };
         vscode.window.showInputBox(options).then(path => {
             if(path) {
                 var data = {
                    channels: '',
                    token   : teamToken,
                    file    : fs.createReadStream(path)
                };

                this.GetChannelList(this.Send, API_UPLOAD_FILES, data);
             }
        });              
     }
     
     // Upload current file
     public UploadFileCurrent() {
        var document = vscode.window.activeTextEditor.document.getText();
        var options = {
            prompt: "Please enter a file extension"
        };
        var data;
        
        if(vscode.window.activeTextEditor.document.isUntitled){
            vscode.window.showInputBox(options).then(type => {
            
                data = {
                    channels: '',
                    token   : teamToken,
                    content : document,
                    filetype: type
                };

                this.GetChannelList(this.Send, API_UPLOAD_FILES, data);         
            }); 
        } else {
            var filename_with_path = vscode.window.activeTextEditor.document.fileName;
            var filename;
            if(filename_with_path.indexOf("\\") != -1){
                filename = filename_with_path.substring(filename_with_path.lastIndexOf("\\") + 1);
            }
            else {
                filename = filename_with_path.substring(filename_with_path.lastIndexOf("/") + 1);
            } 
            data = {
                    channels: '',
                    token   : teamToken,
                    content : document,
                    filename: filename
            };

            this.GetChannelList(this.Send, API_UPLOAD_FILES, data);    
        }
        
     }
     
     // Upload selection as file
     public UploadFileSelection() {
        var editor = vscode.window.activeTextEditor;         
        var selection = editor.selection;
        var document = vscode.window.activeTextEditor.document.getText(selection);
        
        var data = {
            channels: '',
            token   : teamToken,
            content : document
        };
        
        this.GetChannelList(this.Send, API_UPLOAD_FILES, data); 
     }
     
     public SendMessage() {
        var options = {
            prompt: "Please enter a message",
            value: this.savedChannel
        };
         vscode.window.showInputBox(options).then(text => {
             if(text) {
                  var data = {
                    channel : '',
                    token   : teamToken,
                    username: username,
                    icon_url: avatarUrl,
                    text    : text
                 };
                 
                 if(text.startsWith("@") || text.startsWith("#")) {
                    data.channel = text.substr(0, text.indexOf(' '));
                    this.savedChannel = data.channel + " ";  // remember last used channel
                    data.text = text.substr(text.indexOf(' ')+1);
                 }
                 else {
                     this.savedChannel = ""; // clear saved channel
                 }
                 
                 this.GetChannelList(this.Send, API_POST_MESSAGE, data);
             }
        });
    };
    
    public SendSelection() {
        var editor = vscode.window.activeTextEditor;
        if (!editor) {
            return; // No open text editor
        }

        var selection = editor.selection;
        var text = '```'+editor.document.getText(selection)+'```';
 
        var data = {
            channel : '',
            token   : teamToken,
            username: username,
            icon_url: avatarUrl,
            text    : text
        };

        this.GetChannelList(this.Send, API_POST_MESSAGE, data);
    }
    
    public SetSnooze() {
        var options = {
            prompt: "Please enter number of minutes"
        };
        vscode.window.showInputBox(options).then(num_minutes => {
             if(num_minutes) {
                var data = {
                    token      : teamToken,
                    num_minutes: num_minutes
                };
                this.ApiCall(API_SET_SNOOZE, data);
             }
        });
    }
    
    public EndSnooze() {
        var data = {
            token: teamToken
        };
        this.ApiCall(API_END_SNOOZE, data);
    }
        
    dispose() {
    }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
    if(teamToken) {
        let slack = new Slack();
        // send typed message
        vscode.commands.registerCommand('extension.slackSendMsg', () => slack.SendMessage());
        // send selected text as a message
        vscode.commands.registerCommand('extension.slackSendSelection', () => slack.SendSelection());
        // upload current file
        vscode.commands.registerCommand('extension.slackUploadFileCurrent', () => slack.UploadFileCurrent());
        // upload selection
        vscode.commands.registerCommand('extension.slackUploadFileSelection', () => slack.UploadFileSelection());
        // upload file path
        vscode.commands.registerCommand('extension.slackUploadFilePath', () => slack.UploadFilePath());
        // snooze controls
        vscode.commands.registerCommand('extension.slackSetSnooze', () => slack.SetSnooze());
        vscode.commands.registerCommand('extension.slackEndSnooze', () => slack.EndSnooze());
        
        // Add to a list of disposables which are disposed when this extension is deactivated.
        context.subscriptions.push(slack);
    }
    else {
        vscode.window.showErrorMessage('Please enter a team token to use this extension.');
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
}