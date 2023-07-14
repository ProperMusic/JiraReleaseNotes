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

function add_parent_fake (group, key, summary) {
    if (!(key in group)) {
        group[key] = {
            key : key,
            summary : summary,
            release_notes : "",
            children : {},
            labels : "",
            links : []
        };
        
    }
}

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


async function get_issues(username, password, version_id) {
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
        epics: {},
        stories: {},
        others : {}
    };

    for (let issue of response.data.issues) {
        let n = {
            key: issue.key,
            summary: issue.fields.summary,
            type_name: issue.fields.issuetype.name,
            labels: issue.fields.labels.join(","),
            release_notes : ' ',
            children : {},
        };
        n.release_notes = get_custom_field(issue.fields, 'customfield_10303');

        if (!n.release_notes) {
            n.release_notes = get_custom_field(issue.fields, 'customfield_10302');    
        }
        n.parent_key = "";
        n.parent_type_name = "";
        n.parent_summary = "";
        

        if ('parent' in issue.fields && issue.fields.parent != null) {
            n.parent_key        = issue.fields.parent.key;
            n.parent_type_name  = issue.fields.parent.fields.issuetype.name;
            n.parent_summary    = issue.fields.parent.fields.summary;
        }
       

        
        n.links = [];
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
                add_parent_fake(data.output.epics, issue.parent_key, issue.parent_summary);
            }

            add_child(data.output.epics[issue.parent_key], issue);
            
        } 
    }

    for (let k in data.issues) {
        let issue = data.issues[k];
        if (issue.type_name == 'Epic') continue;

        if (issue.type_name == 'Story' && !issue.parent_key) {
            add_parent(data.output.stories, issue);
        } 

    }

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

    let output = "";

    for (let ek in data.output.epics) {
        let epic = data.output.epics[ek];
        //console.log(` epic ${epic.key}`);
        output = add_issue(output, epic, 0, 2);
    }
    output += "\n- ```Stories```\n";

    for (let sk in data.output.stories) {
        let story = data.output.stories[sk];
        // console.log(` story ${story.key}`);
        output = add_issue(output, story, 1, 1);        
       
    }    

    for (let sk in data.output.others) {
        let story = data.output.others[sk];
        // console.log(` other ${story.key}`);
        output = add_issue(output, story, 1, 1);   
    }   

    return output;
}



function add_issue(output, issue, indent, add_children) {

    if (indent == 0) {
        output += "- ```" + ` ${issue.key} : ${issue.summary}` + "```\n";
    } else {
        // output = add_indent(output, indent);
        output = add_char(output, indent, ">");
        output += `- **${issue.key} : ${issue.summary}**\n`
    }
    
    if (issue.release_notes) {
        // output += "\n";
        // output = add_indent(output, indent+1);
        output = add_char(output, indent+1, ">");
        output += ' ' + issue.release_notes + "   \n";
        
    }
    if (issue.labels) {
        // output += "\n";
        // output = add_indent(output, indent+1);
        output = add_char(output, indent+1, ">");
        output += ' [' + issue.labels + ']   \n';
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
            output = add_issue(output, issue.children[k], indent + 1, add_children - 1);
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

    if (!username || !password || !version_id) {
        res.redirect(302, '/');
        return;
    }

    const results = await get_issues(username, password, version_id);
    // res.send('hello');
    res.set('Content-Type', 'text/plain');
    res.status(200).send(results);
});


const server = app.listen(8000, () => {
    console.log("server started");
})
