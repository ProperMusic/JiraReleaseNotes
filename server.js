const express = require('express');
const app =express();
const axios = require('axios');
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'pug');

app.get('/', (req, res) => {
    res.render('home', {
        title: 'Enter Details'
    })
});



async function get_versions(username, password) {
    
    try {
        const response = await axios.get('https://utopia-music.atlassian.net/rest/api/3/project/PD',
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
    } catch (e) {
        console.log(e.cause);
        return e;
        
    }
    
 }

app.get('/get-versions', async (req, res)=> {

    const username = req.query.username;
    const password = req.query.password;

    if (!username || !password) {
        res.redirect(302, '/');
        return;
    }

    const results = await get_versions(username, password);
    // res.send('hello');
    res.status(200).render(
        'versions', {
            title: 'Versions',
            data: results,
            username,
            password
        }
    );
});

function get_custom_field(fields, field_name) {
    
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

class Issue {
    constructor(key) {
        this.key = key;
        this.summary = "";
        this.release_notes = "";
        this.children = {};
        this.labels = [];
        this.links = [];
        this.status = "";
        this.type_name = "";
        this.parent_key = "";
        this.parent_type_name = "";
        this.parent_summary = "";
        this.parent_status = "";
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

function add_parent(group, issue) {
    if (!(issue.key in group)) {
        group[issue.key] = issue;
        
    }
}

function add_child(parent, child) {
    // console.log(`parent = ${parent}, child = ${child}`);
    // if (!('children' in parent)) {
    //     console.error("parent does not contain CHILDREN");
    //     console.log(parent);
    // }
    if (!(child.key in parent.children)) {
        parent.children[child.key] = child;
    }
}


async function get_issues(username, password, version_id, version_name) {
    let data = {};

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
            jql: `project = 'PD' AND FixVersion = ${version_id}`,
        },
        }
    );
    //   console.log(rsp.data.issues[0]);
    data.issues = {};

    data.output = {
        groups: {},
        epics: {},
        stories: {},
        others : {}
    };

    for (let issue of response.data.issues) {
        let n = new Issue(issue.key);

        n.summary       = issue.fields.summary;
        n.type_name     = issue.fields.issuetype.name,
        n.labels        = issue.fields.labels.sort();
        n.status        = issue.fields.status.name,
        
        n.release_notes = get_custom_field(issue.fields, 'customfield_10303');

        if (!n.release_notes) {
            n.release_notes = get_custom_field(issue.fields, 'customfield_10302');    
        }

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
        data.issues[n.key] = n;
    }

    //add categories
    for (let k in data.issues) {
        let issue = data.issues[k];

        if (issue.type != 'Epic' && issue.labels.length > 0) {
            for (let label of issue.labels) {
                let group = new Issue(label);
                group.summary = "";
                
                add_parent(data.output.groups, group);
                add_child(data.output.groups[label], issue);
            }

        }
    }

    let to_remove = [];
    for (let k in data.output.groups.children) {
        let issue = data.output.groups.children;

        if (issue.parent_key && issue.parent_key in data.output.groups.children) {
            add_child(data.output.groups.children[issue.parent_key], issue);
            to_remove.push(issue.key);
        }
    }

    for (let k of to_remove) {
        delete data.output.groups.children[k];
    }



    // add epics
    for (let k in data.issues) {
        let issue = data.issues[k];

        if (issue.type_name == 'Epic') {
            add_parent(data.output.epics, issue);

        } else if (issue.parent_key && issue.parent_type_name == 'Epic') {
            if (issue.parent_key in data.issues) {
                let epic = data.issues[issue.parent_key];
                add_parent(data.output.epics, epic);
            } else {
                let p = new Issue(issue.parent_key);
                p.summary = issue.parent_summary;
                p.type_name = issue.parent_type_name;
                p.status    = issue.parent_status;
                add_parent(data.output.epics, p);
            }

            add_child(data.output.epics[issue.parent_key], issue);
            
        } 
    }
    // add orphan stories
    for (let k in data.issues) {
        let issue = data.issues[k];
        if (issue.type_name == 'Epic') continue;

        if (issue.type_name == 'Story' && !issue.parent_key) {
            add_parent(data.output.stories, issue);
        } 

    }
    // add everything else
    for (let k in data.issues) {
        let issue = data.issues[k];
        if (issue.type_name == 'Epic') continue;
        if (issue.type_name == 'Story' && !issue.parent_key) continue;
        
        
        if (issue.parent_key) {

            if (issue.parent_key in data.output.epics) {
         
                add_child(data.output.epics[issue.parent_key], issue);

            } else if (issue.parent_key in data.output.stories) {
                add_child(data.output.stories[issue.parent_key], issue);
            } else {
                let found = false;
                for (let k0 in data.output.epics) {
                    let epic = data.output.epics[k0];

                    if (issue.parent_key in epic.children) {
                        add_child(epic.children[issue.parent_key], issue);
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    data.output.others[issue.key] = issue;
                }

                
            }

        } else {
            add_parent(data.output.others, issue);
        }


    }

    let output = `\n# ${version_name}    \n`;

    output += "\n > Note that work items may appear more than once in the list below. This is so you can find items relevant to you more easily.";
    output += "\n > Each work item has a unique code (PD-#### or PDSM-####) so it should be clear where duplication occurs.";
    output += "\n > PDSM (Service Desk) tickets do not appear in this list in full, only as references from work items.";
    output += "\n > PD work items represent the actual development work undertaken, where PDSM ticket represent requests or questions from users " +
             "which are not relevant for release notes.";
    output += "\n > You can search the release notes using your PDSM ticket reference to find work that relates to your tickets.";

    output += "\n\n\n## Labels / Tags    \n";

    let keys = Object.keys(data.output.groups).sort();
    for (let ek of keys) {
        let item = data.output.groups[ek];

        output = add_issue(output, item, 0, 3, false);
    }

    output += "\n\n## Projects    \n";
    keys = Object.keys(data.output.epics).sort();
    for (let ek of keys) {
        let epic = data.output.epics[ek];
        //console.log(` epic ${epic.key}`);
        output = add_issue(output, epic, 0, 2);
    }
    output += "\n\n## Work Items    \n";
    keys = Object.keys(data.output.stories).sort();
    for (let sk of keys) {
        let story = data.output.stories[sk];
        // console.log(` story ${story.key}`);
        output = add_issue(output, story, 1, 1);        
       
    }    
    keys = Object.keys(data.output.others).sort();
    for (let sk of keys) {
        let story = data.output.others[sk];
        // console.log(` other ${story.key}`);
        output = add_issue(output, story, 1, 1);   
    }   

    return output;
}



function add_issue(output, issue, indent, add_children, add_tags = true) {

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

    if (add_children > 0 && 'children' in issue) {
        
        for (let k in issue.children) {
            
            // output = add_char(output, indent+1, ">");
            output = add_issue(output, issue.children[k], indent + 1, add_children - 1, add_tags);
        }
    } else {
        
    }
    // output += "\n";
    return output;
}

function add_char(output, count, str) {
    for (let i = 0; i < count; i += 1) {
        output += str;
    }
    return output;

}

function add_indent(output, indent) {
    return add_char(output, indent * 3, " ");
}

app.get('/get-issues', async (req, res)=> {

    const username   = req.query.username;
    const password   = req.query.password;
    const version_id = req.query.version_id;
    const version_name = req.query.version_name;

    if (!username || !password || !version_id) {
        res.redirect(302, '/');
        return;
    }

    const results = await get_issues(username, password, version_id, version_name);
    // res.send('hello');
    res.set('Content-Type', 'text/plain');
    res.status(200).send(results);
});


const server = app.listen(8000, () => {
    console.log("server started");
})
