// const express = require('express');
import express, {Request, Response} from "express";
const bodyParser = require('body-parser');
const app = express();
const axios = require('axios');
const path = require('path');
const { release } = require('os');
const SERVER_PORT = 8000;

let https;
try {
  https = require('node:https');
} catch (err) {
  console.error('https support is disabled!');
} 


app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended : false}));

//app.set('views', path.join(__dirname, 'build', 'views'));
app.set('view engine', 'pug');
// app.locals.basedir = path.join(__dirname, 'build');
console.log(`dir name is :  [${__dirname}]`);

app.get('/', (req : Request, res : Response) => {
    res.render('home', {
        title: 'Enter Details'
    })
});



async function get_versions(username : string , password : string, project_key : string ) {
    
    try {
        const response = await axios.get(`https://utopia-music.atlassian.net/rest/api/3/project/${project_key}`,
        {
            
            withCredentials: true,
            headers: {'X-Requested-With': 'XMLHttpRequest'},
            auth : {
                username: username,
                password: password
            }
        });
        // console.log(response.data);
       
        
        
        return response.data;
    } catch (e : any) {
        console.log(e.cause);
        return e;
        
    }
    
 }

app.post('/get-versions', async (req : Request, res : Response)=> {

    let data = req.body;
    console.log("request = " + JSON.stringify(data));
    const username : string = data.username as string;
    const password : string = data.password as string;
    const project_key : string = data.project_key as string;

    if (!username || !password || !project_key) {
        res.redirect(302, '/');
        return;
    }

    const results = await get_versions(username, password,project_key);
    // res.send('hello');
    res.status(200).render(
        'versions', {
            title: 'Versions',
            data: results,
            username,
            password,
            project_key
        }
    );
});

// app.get('/get-versions', async (req : Request, res : Response)=> {

//     const username : string = req.query.username as string;
//     const password : string = req.query.password as string;

//     if (!username || !password) {
//         res.redirect(302, '/');
//         return;
//     }

//     const results = await get_versions(username, password);
//     // res.send('hello');
//     res.status(200).render(
//         'versions', {
//             title: 'Versions',
//             data: results,
//             username,
//             password
//         }
//     );
// });

function get_custom_field(fields : any, field_name : string) {
    
    if (field_name in fields && fields[field_name] != null) {
        for (let k of fields[field_name].content) {
            if (k.type == 'paragraph') {
                for (let k0 of k.content) {
                    if (k0.type == 'text' && k0.text != '') {
                        return k0.text;
                    }

                }
            }
            
        }
    }
    return "";
}
type IssueMap  = Map<string, Issue>;

class Issue {
    readonly key : string;
    summary : string =  "";
    release_notes: string = "";
    children : IssueMap;
    labels : string[] = [];
    links : string[] = [];
    status : string = "";
    type_name : string = "";
    parent_key : string = "";
    parent_type_name : string = "";
    parent_summary : string = "";
    parent_status : string = "";
    category : string = "";

    constructor(_key: string) {
        this.key = _key;
        this.children = new Map<string, Issue>();
    }
}
// type DataGroup = {
//     [key : string] : Issue
// }



class IssueData  {
    issues : IssueMap;
    out_groups : IssueMap;
    out_epics : IssueMap;
    out_stories : IssueMap;
    out_others : IssueMap;

    constructor() {
        this.issues      = new Map<string, Issue>();
        this.out_groups  = new Map<string, Issue>();
        this.out_epics   = new Map<string, Issue>();
        this.out_stories = new Map<string, Issue>();
        this.out_others  = new Map<string, Issue>();
    }
}

// function add_parent_fake (group, key, summary, type_name = "") {
//     if (!(key in group)) {
//         group[key] = {
//             key : key,
//             summary : summary,
//             release_notes : "",
//             children : {},
//             labels : "",
//             links : [],
//             status : "",
//             type_name : type_name

//         };
        
//     }
// }

function add_parent(group : Map<string, Issue>, issue : Issue) {
    if (!group.has(issue.key)) {
        group.set(issue.key, issue);
        
    }
}

function add_child(parent : Issue, child : Issue) {
    // console.log(`parent = ${parent}, child = ${child}`);
    // if (!('children' in parent)) {
    //     console.error("parent does not contain CHILDREN");
    //     console.log(parent);
    // }
    if (!(parent.children.has(child.key))) {
        parent.children.set(child.key, child);
    }
}

function sort_keys(A : string, B : string) {
    let a : number = split_key(A).id;
    let b : number = split_key(B).id;

    if (a < b ) return -1;
    if (a > b ) return 1;
    return 0;

}

function split_key(code : string) : { project : string, id : number} {

    let elems : string[] = code.split("-");
    let p : string = elems[0];
    let v : number = Number(elems[1]);

    return {project : p, id : v};

}


async function get_issues(username : string, password : string , project_key : string, version_id : number, version_name : string) {
    let data : IssueData = new IssueData();

    const response = await axios.get(
        "https://utopia-music.atlassian.net/rest/api/3/search",
        {
            withCredentials: true,
            headers: { "X-Requested-With": "XMLHttpRequest" },
            auth: {
                username: username,
                password: password,
                },
            params: {
                jql: `project = '${project_key}' AND FixVersion = ${version_id}`,
                expand : "names",
            },
        }
    );
    //   console.log(rsp.data.issues[0]);
    // data.issues = {};

    // data.output = {
    //     groups: {},
    //     epics: {},
    //     stories: {},
    //     others : {}
    // };

    let release_notes_fields : string[] = [];
    // let category_field : string = "";
    for (let k in response.data.names) {
        let v = response.data.names[k];

        if (v.toUpperCase() === "RELEASE NOTES") {
            release_notes_fields.push(k);
            console.log(`release notes: ${v} ${k}`);
        } 
        // else if (v.toUpperCase() === "CATEGORY") {
        //     category_field = k;
        // }
    }    

    for (let issue of response.data.issues) {

        // console.log(issue);

        if (issue.fields.labels.includes("NoRelNotes")) continue;

        if (issue.fields.issuetype.name === "Database Alteration") continue;

        let n = new Issue(issue.key);


        n.summary       = issue.fields.summary;
        n.type_name     = issue.fields.issuetype.name;
        n.labels        = issue.fields.labels.sort();


        // if (issue.fields.labels != null) {
        //     console.log(`${issue.key} labels : ${issue.fields.labels} ${n.labels}`);
        // }
        n.status        = issue.fields.status.name;

        n.release_notes = "";
        for (let field_name of release_notes_fields) {
            let v = get_custom_field(issue.fields, field_name);
            if (v) {
                if (!n.release_notes) {
                    n.release_notes = v;
                } else {
                    n.release_notes += " " + v;
                }
            }
        }

        // if (category_field) {
        //     n.category = get_custom_field(issue.fields, category_field);


        //     if (n.category && !n.labels.includes(n.category)) {
        //         n.labels.push(n.category);
        //         n.labels.sort();
        //     }
        // }


        if ('parent' in issue.fields && issue.fields.parent != null) {
            n.parent_key        = issue.fields.parent.key;
            n.parent_type_name  = issue.fields.parent.fields.issuetype.name;
            n.parent_summary    = issue.fields.parent.fields.summary;
            n.parent_status     = issue.fields.parent.fields.status.name;
        }

        if (issue.fields.issuelinks.length > 0) {
            for (let li of issue.fields.issuelinks) {
                if ("outwardIssue" in li) {
                    n.links.push(li.outwardIssue.key);
                } else if ("inwardIssue" in li) {
                    n.links.push(li.inwardIssue.key);
                }
            }
        }

        data.issues.set(n.key,n);

    }
    console.log(`a) issues,groups,epics,stories,others = ${data.issues.size},${data.out_groups.size},${data.out_epics.size},${data.out_stories.size},${data.out_others.size}`);

    //add categories
    for (let k of data.issues.keys()) {
        let issue : Issue = data.issues.get(k)!;
        

        if (issue.type_name.toUpperCase() !== "EPIC" && issue.labels.length > 0) {
            for (let label of issue.labels) {

                if (!data.out_groups.has(label)) {
                    // console.log(`${label} does not appear in the groups map`);
                    let group = new Issue(label);
                    add_parent(data.out_groups, group);
                    add_child(group, issue);
                } else {
                    // console.log(`${label} does appear in the groups map`);
                    let group = data.out_groups.get(label)!;
                    add_child(group, issue);
                }

            }

        }
    }

    console.log(`b) issues,groups,epics,stories,others = ${data.issues.size},${data.out_groups.size},${data.out_epics.size},${data.out_stories.size},${data.out_others.size}`);

    for (let k of data.out_groups.keys()) {
        let group_issue : Issue = data.out_groups.get(k)!; 
        
        let to_remove = [];
        

        for (let ck in group_issue?.children.keys()) {
            let child_issue = group_issue.children.get(ck)!;

            if (child_issue.parent_key && group_issue.children.has(child_issue.parent_key)) {
                let parent : Issue = group_issue.children.get(child_issue.parent_key)!;

                add_child(parent, child_issue);
                to_remove.push(child_issue.key);
            }
        }
        for (let k of to_remove) {
            group_issue?.children.delete(k);
        }

    }

    console.log(`c) issues,groups,epics,stories,others = ${data.issues.size},${data.out_groups.size},${data.out_epics.size},${data.out_stories.size},${data.out_others.size}`);



    // add epics
    for (let k of data.issues.keys()) {
        let issue : Issue = data.issues.get(k)!;
        

        if (issue.type_name === 'Epic') {
            add_parent(data.out_epics, issue);

        } else if (issue.parent_key && issue.parent_type_name == 'Epic') {
            //is the epic also in the list of issues?
            //if so use that
            if (data.issues.has(issue.parent_key)) {
                let epic = data.issues.get(issue.parent_key);
                if (epic) {

                    add_parent(data.out_epics, epic);
                    add_child(epic, issue);
                }
            } else {
                //otherwise, create a dummy epic to attach this issue to
                let p = new Issue(issue.parent_key);
                p.summary = issue.parent_summary;
                p.type_name = issue.parent_type_name;
                p.status    = issue.parent_status;
                add_parent(data.out_epics, p);
                let epic = data.out_epics.get(issue.parent_key);
                if (epic) {
                    add_child(epic, issue);

                }
            }

            
        } 
    }

    console.log(`d) issues,groups,epics,stories,others = ${data.issues.size},${data.out_groups.size},${data.out_epics.size},${data.out_stories.size},${data.out_others.size}`);
    // add orphan stories
    for (let k of data.issues.keys()) {
        let issue = data.issues.get(k);
        if (!issue) continue;

        if (issue.type_name == 'Epic') continue;

        if (issue.type_name == 'Story' && !issue.parent_key) {
            add_parent(data.out_stories, issue);
        } 

    }

    console.log(`e) issues,groups,epics,stories,others = ${data.issues.size},${data.out_groups.size},${data.out_epics.size},${data.out_stories.size},${data.out_others.size}`);
    // add everything else
    for (let k of data.issues.keys()) {
        let issue = data.issues.get(k);
        if (!issue) continue;

        if (issue.type_name == 'Epic') continue;
        if (issue.type_name == 'Story' && !issue.parent_key) continue;
        
        
        if (issue.parent_key) {

            if (data.out_epics.has(issue.parent_key)) {
         
                add_child(data.out_epics.get(issue.parent_key)!, issue);

            } else if (data.out_stories.has(issue.parent_key)) {
                add_child(data.out_stories.get(issue.parent_key)!, issue);
            } else {
                let found = false;
                for (let k0 of data.out_epics.keys()) {
                    let epic = data.out_epics.get(k0);

                    if (epic!.children.has(issue.parent_key)) {
                        add_child(epic!.children.get(issue.parent_key)!, issue);
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    data.out_others.set(issue.key, issue);
                    // data.output.others[issue.key] = issue;
                }

                
            }

        } else {
            add_parent(data.out_others, issue);
        }


    }

    console.log(`f) issues,groups,epics,stories,others = ${data.issues.size},${data.out_groups.size},${data.out_epics.size},${data.out_stories.size},${data.out_others.size}`);
   
    let output : string = `
---
slug: ${version_name.substring(0,10)}-release-notes
title: ${version_name.substring(0,10)} Release Notes
tags: [release-notes, basil, basil10]
---

## ${version_name}    \n`;

    output += "\n > Note that work items may appear more than once in the list below. This is so you can find items relevant to you more easily.";
    output += "\n > Each item has a unique code (PD-#### (for development work) or PDSM-#### (for service desk tickets)) so it should be " +
     "clear where duplication occurs.";
    output += "\n > PDSM (Service Desk) tickets do not appear in this list in full, only as references from work items.";
    output += "\n > PD work items represent the actual development work undertaken, where PDSM ticket represent requests or questions from users " +
             "which are not relevant for release notes.";
    output += "\n > You can search the release notes using your PDSM ticket reference to find work that relates to your tickets.";

    output += "\n\n\n## Labels / Tags    \n";

    let keys = Array.from(data.out_groups.keys()).sort();
    // console.log(keys);
    for (let ek of keys) {
        console.log(ek);
        let item = data.out_groups.get(ek);
        if (!item) continue;
        output = add_issue(output, item, 0, 3, false);
    }

    output += "\n\n## Projects    \n";
    keys = Array.from(data.out_epics.keys()).sort(sort_keys);
    for (let ek of keys) {
        let epic = data.out_epics.get(ek);
        //console.log(` epic ${epic.key}`);
        output = add_issue(output, epic!, 0, 2);
    }
    output += "\n\n## Work Items    \n";

    keys = Array.from(data.out_stories.keys()).sort(sort_keys);
    // keys = Object.keys(data.out_stories).sort();
    for (let sk of keys) {
        let story = data.out_stories.get(sk);
        // console.log(` story ${story.key}`);
        output = add_issue(output, story!, 0, 3);        
       
    }    
    keys = Array.from(data.out_others.keys()).sort(sort_keys);
    for (let sk of keys) {
        let story = data.out_others.get(sk);
        // console.log(` other ${story.key}`);
        output = add_issue(output, story!, 0, 3);   
    }   

    return output;
}



function add_issue(output : string , issue : Issue, indent : number ,  add_children : number, add_tags : boolean = true) {

    if (indent == 0) {
        output += "- ```" + issue.key;
        if (issue.summary) {
            output += " : " + issue.summary;
        }
        output +=  "```";
        if (issue.status) {
            output += ` [${issue.status}]`;
        }
        output += "    \n";
    } else {
        // output = add_indent(output, indent);
        output = add_char(output, indent, ">");
        output += `- **${issue.key} : ${issue.summary}**`
        if (issue.status) {
            output += ` [${issue.status}]`;
        }        
        output += '   \n';
    }
    
    if (issue.release_notes) {
        // output += "\n";
        // output = add_indent(output, indent+1);
        output = add_char(output, indent+1, ">");
        output += ' ' + issue.release_notes + "   \n";
        
    }
    if (issue.labels.length > 0 && add_tags) {
        // output += "\n";
        // output = add_indent(output, indent+1);
        output = add_char(output, indent+1, ">");
        output += ' [' + issue.labels.join(", ") + ']   \n';
    }
    if (issue.links.length > 0) {
        // output += "\n";
        // output = add_indent(output, indent+1);
        output = add_char(output, indent+1, ">");
        output += ' links: ' + issue.links.join(", ") + "   \n";
    }      

    if (add_children > 0 && issue.children.size > 0) {
        
        let keys = Array.from(issue.children.keys()).sort(sort_keys);
        for (let k of keys) {
            let child = issue.children.get(k)!;
            // output = add_char(output, indent+1, ">");
            output = add_issue(output, child, indent + 1, add_children - 1, add_tags);
        }

    }
    // output += "\n";
    return output;
}

function add_char(output : string, count : number, str : string) {
    for (let i = 0; i < count; i += 1) {
        output += str;
    }
    return output;

}

function add_indent(output : string, indent : number) {
    return add_char(output, indent * 3, " ");
}

app.post('/get-issues', async (req : any, res : any)=> {

    let data = req.body;
    console.log("get-issues request = " + JSON.stringify(data));
    const username : string = data.username as string;
    const password : string = data.password as string;
    const version_id : number = data.version_id as number;
    const version_name : string = data.version_name as string;
    const project_key : string = data.project_key as string;

    console.log(`
        username : ${username}
        password : ${password}
        version_id : ${version_id}
        version_name : ${version_name}
        project_key : ${project_key}
    `);

    if (!username || !password || !version_id || !project_key) {
        res.redirect(302, '/');
        return;
    }

    const results = await get_issues(username, password, project_key, version_id, version_name);
    // res.send('hello');
    res.set('Content-Type', 'text/plain');
    res.status(200).send(results);
});


const server = app.listen(SERVER_PORT, () => {
    console.log(`server started listening on ${SERVER_PORT}`);
})
