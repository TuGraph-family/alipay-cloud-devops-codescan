

const core = require('@actions/core');
const axios = require('axios');
const jobProcessors = require('./jobprocessors/processors');
const {context} = require("@actions/github");

async function getStarted() {
    let failed = false;
    try {
        const spaceId = `7800020`;
        const projectId = "9701567";
        const templateId = 9802227;
        // 从参数获取branch和codeRepo
        const branchName = process.env.GITHUB_HEAD_REF;
        const branch = branchName.replace('refs/heads/','')
        const codeRepo = context.payload.pull_request.head.repo.ssh_url;
        core.debug("branchName: " + branchName)

        //1,获取token
        core.info("starting...")
        const tokenResponse = await axios.post('https://tcloudrunconsole.openapi.cloudrun.cloudbaseapp.cn/v2/login/serviceaccount',
            {
                "parent_uid": core.getInput('parent_uid', { required: true }),
                "private_key": core.getInput('private_key', { required: true }),
            })
        core.debug("tokenResponse: " + tokenResponse.data.data.access_token);
        const headers = {
            'Authorization': `Bearer ${tokenResponse.data.data.access_token}`,
            'x-node-id': '27120665446352551'
        };
        //2,调用代码检查
        const triggerResponse = await axios.post(`https://tdevstudio.openapi.cloudrun.cloudbaseapp.cn/webapi/v1/space/${spaceId}/project/${projectId}/pipeline/execute`,
         {"templateId":templateId,"branch":branch,"codeRepo": codeRepo},
        { headers: headers }
        );
        core.debug("triggerResponse: "+JSON.stringify(triggerResponse.data));
        const recordId = triggerResponse.data.result.recordId;


        // sca-licence
        // projectId = 5603361;
        // let recordId = 5705361;

        //sca-code
        // projectId = 293;
        // let recordId = 5703971;

        // stc
        // projectId = 5604129;
        // let recordId = 5705537;

        //3,循环获取recordInfo
        core.info("scanning...")
        let recordResponse;
        let status = "";
        const timeout = 20//minutes
        for (let i = 0; i < timeout*6; i++) {
            recordResponse = await axios.get(`https://tdevstudio.openapi.cloudrun.cloudbaseapp.cn/webapi/v1/space/${spaceId}/project/${projectId}/pipeline/${recordId}`,
                {headers: headers}
            );
            status=recordResponse.data.result.status
            if (status === "FINISHED") {
                break;
            }
            await sleep(10);
        }
        core.info("scan finished")
        let recordResult = recordResponse.data.result;
        core.info("getting info...")
        core.debug("recordResponse.data: " + JSON.stringify(recordResponse.data))
        //获取失败的job, 获取失败信息

        const allJobs = recordResult.stageExecutions.flatMap(stage => stage.jobExecutions);

        for (const failureJob of allJobs) {
            const jobId = failureJob.id;
            const jobResponse = await axios.get(`https://tdevstudio.openapi.cloudrun.cloudbaseapp.cn/webapi/v1/space/${spaceId}/project/${projectId}/pipeline/${recordId}/job/${jobId}`,
                {headers: headers}
            );
            core.debug("jobResponse.data: " + JSON.stringify(jobResponse.data))
            const jobDetail = jobResponse.data.result.data;
            const jobProcessor = jobProcessors[failureJob.componentName];
            if (jobProcessor){
                failed = jobProcessor(jobDetail) || failed;
            }
        }
    } catch (error) {
        core.setFailed(error.message);
    }
    core.setOutput("result",failed?"FAILED":"PASSED")
}
function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}
let notCare = getStarted();
