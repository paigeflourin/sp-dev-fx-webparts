import { Log } from "@microsoft/sp-core-library";
import { IWebPartContext} from "@microsoft/sp-webpart-base";
import { Constants, CommunicationConfigurationService, ICommunicationConfigurationService, ICommunicationService } from "./";
import * as jQuery from "jquery";
declare var Skype: any;

export class SkypeForBusinessCommunicationService implements ICommunicationService {
    private static initializePromise: any;
    private static configurationService: ICommunicationConfigurationService;
    private static webPartContext: () => IWebPartContext;
    public constructor(WebPartContext: () => IWebPartContext) {
        SkypeForBusinessCommunicationService.configurationService = new CommunicationConfigurationService(WebPartContext());
        SkypeForBusinessCommunicationService.webPartContext = WebPartContext;
    }
    public async SubscribeToStatusChangeForUser(userEmail: string, userDisplayName: string,
        handler: (newStatus: string, oldStatus: string, displayName: string) => void): Promise<boolean> {
        if (!userEmail || !handler) {
            return false;
        }
        userDisplayName = userDisplayName.replace("(...)", "");
        const skypeApp: any = await this.Initialize();
        const personsAndGroupsManager: any = skypeApp.personsAndGroupsManager;
        const mePerson: any = personsAndGroupsManager.mePerson;
        if (SkypeForBusinessCommunicationService.webPartContext().pageContext.user.email === userEmail) {
            Log.info(Constants.ErrorCategory, `Bypassed skype subscription for current user ${userEmail}`);
            handler("Online", undefined, mePerson.displayName());
        } else {
            const query: any = personsAndGroupsManager.createPersonSearchQuery();
            query.text(userEmail);
            query.limit(1);
            await query.getMore();
            query.results().forEach((result) => {
                const person: any = result.result;
                if (person.id().indexOf(userEmail) !== -1) {
                    handler("Offline", undefined, userDisplayName);
                    person.status.changed((newStatus, reason, oldStatus) => {
                        Log.info(Constants.ErrorCategory,
                            `${person.displayName()} status changed from ${oldStatus} to ${newStatus} because ${reason}`);
                        handler(newStatus, oldStatus, person.displayName());
                    });
                    person.status.subscribe();
                }
            });
        }
        return true;
    }
    private Initialize(): Promise<any> {
        if (!SkypeForBusinessCommunicationService.initializePromise) {
            SkypeForBusinessCommunicationService.initializePromise = new Promise<any>((resolve, reject) => {
                return SkypeForBusinessCommunicationService.configurationService.getCurrentConfiguration().then((currentConfiguration) => {
                    return jQuery.getScript("https://swx.cdn.skype.com/shared/v/1.2.36/SkypeBootstrap.min.js").then(() => {
                        const config: {apiKey: string, apiKeyCC: string} = {
                            apiKey: "a42fcebd-5b43-4b89-a065-74450fb91255", // sdk
                            apiKeyCC: "9c967f6b-a846-4df2-b43d-5167e47d81e1", // sdk+ui
                        };
                        if (currentConfiguration && currentConfiguration.ClientId) {
                            Skype.initialize({ apiKey: config.apiKey }, (api) => {
                                const app: any = new api.application();
                                app.signInManager.signIn ({
                                    client_id: currentConfiguration.ClientId,
                                    cors: true,
                                    origins: ["https://webdir.online.lync.com/autodiscover/autodiscoverservice.svc/root"],
                                    redirect_uri: currentConfiguration.RedirectUri,
                                }).then(() => {
                                    resolve(app);
                                }, (err: any) => {
                                    Log.error(Constants.ErrorCategory, new Error(`cannot sign in ${err}`));
                                    location.assign("https://login.microsoftonline.com/common/oauth2/authorize?response_type=token" +
                                        "&client_id=" + currentConfiguration.ClientId +
                                        "&redirect_uri=" + location.href +
                                        "&resource=https://webdir.online.lync.com");
                                    reject(err);
                                });
                            });
                        } else {
                            Log.error(Constants.ErrorCategory, new Error(`configuration missing for skype presence service`));
                        }
                    });
                });
            });
        }
        return SkypeForBusinessCommunicationService.initializePromise;
    }
}
